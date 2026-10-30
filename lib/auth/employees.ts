import { and, eq, or } from 'drizzle-orm';
import { schema, type Tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/outbox';

export async function isAllowlisted(tx: Tx, id: { email?: string | null; oid?: string | null }) {
  const conds = [id.email ? eq(schema.employeeAllowlist.emailOrOid, id.email.toLowerCase()) : undefined, id.oid ? eq(schema.employeeAllowlist.emailOrOid, id.oid) : undefined].filter(
    Boolean,
  ) as ReturnType<typeof eq>[];
  if (conds.length === 0) return false;
  const rows = await tx.select({ id: schema.employeeAllowlist.id }).from(schema.employeeAllowlist).where(or(...conds)).limit(1);
  return rows.length > 0;
}

export async function getAzentioOrg(tx: Tx) {
  const [org] = await tx.select().from(schema.organisations).where(eq(schema.organisations.type, 'azentio')).limit(1);
  return org;
}

/**
 * Signing in proves identity only. Employee membership requires the allow-list (or, P1, a configured Entra group).
 * Never grants moderator/publisher/admin — those are portal grants assigned by a portal admin.
 * Returns whether the user ends up with an active employee membership.
 */
export async function ensureEmployeeMembership(
  tx: Tx,
  user: { id: string; email: string; entraOid?: string | null },
  method: 'microsoft' | 'magiclink',
  opts: { groupApproved?: boolean } = {},
) {
  const org = await getAzentioOrg(tx);
  if (!org) return false;
  const [existing] = await tx.select().from(schema.memberships).where(and(eq(schema.memberships.userId, user.id), eq(schema.memberships.orgId, org.id))).limit(1);
  if (existing?.status === 'active') return true;
  if (existing?.status === 'revoked') return false;
  const approved = opts.groupApproved || (await isAllowlisted(tx, { email: user.email, oid: user.entraOid }));
  if (approved) {
    if (existing) await tx.update(schema.memberships).set({ status: 'active', updatedAt: new Date() }).where(eq(schema.memberships.id, existing.id));
    else await tx.insert(schema.memberships).values({ userId: user.id, orgId: org.id, role: 'employee', status: 'active' });
    await audit(tx, { actorId: user.id, action: 'membership.employee_provisioned', resourceType: 'membership', meta: { method, via: opts.groupApproved ? 'entra_group' : 'allowlist' } });
    return true;
  }
  if (method === 'microsoft') {
    // Verified Azentio identity without approval → access pending + admin notified (AUTH-03).
    const inserted = await tx.insert(schema.accessRequests).values({ userId: user.id }).onConflictDoNothing().returning();
    if (inserted.length > 0) {
      const admins = await tx.select({ userId: schema.grants.userId }).from(schema.grants).where(eq(schema.grants.grant, 'portal_admin'));
      for (const a of admins) {
        await notify(tx, { userId: a.userId, type: 'access_request', title: `Access request: ${user.email}`, body: 'A verified Azentio identity is waiting for employee approval.', link: '/admin/people', dedupeKey: `access-req:${user.id}:${a.userId}` });
      }
      await audit(tx, { actorId: user.id, action: 'membership.access_requested', resourceType: 'access_request', resourceId: inserted[0].id });
    }
  }
  return false;
}
