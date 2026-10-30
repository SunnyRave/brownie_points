import { and, desc, eq } from 'drizzle-orm';
import { schema, withSystemTx, withTenantTx } from '@/lib/db';
import { hashToken, randomToken } from '@/lib/crypto';
import { audit, auditDenial } from '@/lib/audit';
import { notify, queueEmail } from '@/lib/outbox';
import { enforce } from '@/lib/policy/enforce';
import { HttpError, forbidden, notFound } from '@/lib/http';
import { appUrl } from '@/lib/settings';
import { CLIENT_ROLES } from '@/lib/validation';
import type { Principal } from '@/lib/policy/types';
import { assertEmailMatches } from './magic';
import { revokeUserSessions } from './session';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const teamResource = (tenantId: string | null) => ({ type: 'team', audience: tenantId ? { kind: 'tenant' as const, tenantId } : null });

/** Client admins may only propose client roles, only into their active tenant (IAM-06). Anything else is rejected and audited. */
async function assertClientRole(principal: Principal, role: string, action: string) {
  if (!(CLIENT_ROLES as readonly string[]).includes(role)) {
    await auditDenial({ actorId: principal.userId, action, resourceType: 'membership', tenantId: principal.activeTenantId, meta: { reason: 'role_not_assignable', attemptedRole: role } });
    throw forbidden('role_not_assignable', 'Client administrators can only assign client roles within their own organisation.');
  }
  return role as (typeof CLIENT_ROLES)[number];
}

export async function createInvitation(principalIn: Principal | null, input: { email: string; role: string }) {
  const tenantId = principalIn?.activeTenantId ?? null;
  await enforce(principalIn, 'invite_member', teamResource(tenantId));
  const principal = principalIn!;
  const role = await assertClientRole(principal, input.role, 'invite_member');
  const token = randomToken();
  const url = `${appUrl()}/invite/${token}`;
  const invitation = await withTenantTx(principal.userId, tenantId!, async (tx) => {
    const [inv] = await tx
      .insert(schema.invitations)
      .values({ orgId: tenantId!, email: input.email, proposedRole: role, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITATION_TTL_MS), invitedBy: principal.userId })
      .returning();
    await queueEmail(tx, { to: input.email, subject: 'You have been invited to an azentio.ai workspace', text: `Accept within 7 days: ${url}`, dedupeKey: `invite:${inv.id}`, kind: 'invitation', link: url });
    await audit(tx, { actorId: principal.userId, action: 'invitation.create', resourceType: 'invitation', resourceId: inv.id, tenantId, meta: { role } });
    return inv;
  });
  // The raw link is shown once to the inviter because email may be queued but not delivered.
  return { id: invitation.id, url, expiresAt: invitation.expiresAt, emailStatus: 'queued' as const };
}

export async function revokeInvitation(principalIn: Principal | null, invitationId: string) {
  const tenantId = principalIn?.activeTenantId ?? null;
  await enforce(principalIn, 'invite_member', teamResource(tenantId));
  const principal = principalIn!;
  await withTenantTx(principal.userId, tenantId!, async (tx) => {
    const updated = await tx
      .update(schema.invitations)
      .set({ status: 'revoked' })
      .where(and(eq(schema.invitations.id, invitationId), eq(schema.invitations.status, 'pending')))
      .returning();
    if (updated.length === 0) throw notFound();
    await audit(tx, { actorId: principal.userId, action: 'invitation.revoke', resourceType: 'invitation', resourceId: invitationId, tenantId });
  });
}

export type InvitationView = {
  id: string;
  orgName: string;
  orgSlug: string;
  email: string;
  proposedRole: string;
  state: 'valid' | 'expired' | 'used' | 'revoked';
};

export async function getInvitationByToken(token: string): Promise<InvitationView | null> {
  return withSystemTx(async (tx) => {
    const [row] = await tx
      .select({ inv: schema.invitations, orgName: schema.organisations.name, orgSlug: schema.organisations.slug })
      .from(schema.invitations)
      .innerJoin(schema.organisations, eq(schema.organisations.id, schema.invitations.orgId))
      .where(eq(schema.invitations.tokenHash, hashToken(token)))
      .limit(1);
    if (!row) return null;
    const { inv } = row;
    const state = inv.status === 'revoked' ? 'revoked' : inv.usedAt || inv.status === 'accepted' ? 'used' : inv.expiresAt.getTime() < Date.now() ? 'expired' : 'valid';
    return { id: inv.id, orgName: row.orgName, orgSlug: row.orgSlug, email: inv.email, proposedRole: inv.proposedRole, state };
  });
}

/**
 * AT-06: single use, unexpired, and only for the verified account the invitation names.
 * Accepting requires the terms + sharing explainer to be acknowledged; joining is not consent to share or train.
 */
export async function acceptInvitation(principal: Principal, token: string, acknowledged: { terms: boolean; sharingExplainer: boolean }) {
  if (!acknowledged.terms || !acknowledged.sharingExplainer) throw new HttpError(400, 'terms_required', 'Please review the workspace terms and the sharing explanation.');
  return withSystemTx(async (tx) => {
    const now = new Date();
    const [inv] = await tx.select().from(schema.invitations).where(eq(schema.invitations.tokenHash, hashToken(token))).limit(1);
    const deny = async (code: string, msg: string) => {
      await audit(tx, { actorId: principal.userId, action: 'invitation.accept', resourceType: 'invitation', resourceId: inv?.id ?? null, tenantId: inv?.orgId ?? null, decision: 'deny', meta: { reason: code } });
      return { ok: false as const, code, message: msg };
    };
    if (!inv) return deny('invitation_not_found', 'This invitation link is not valid.');
    if (inv.status !== 'pending' || inv.usedAt) return deny('invitation_used', 'This invitation has already been used or was revoked.');
    if (inv.expiresAt.getTime() < now.getTime()) return deny('invitation_expired', 'This invitation has expired. Ask your administrator for a new one.');
    try {
      assertEmailMatches(principal.email, inv.email);
    } catch {
      return deny('invitation_email_mismatch', 'This invitation was issued to a different email address.');
    }
    // Atomic single-use claim.
    const claimed = await tx
      .update(schema.invitations)
      .set({ usedAt: now, status: 'accepted' })
      .where(and(eq(schema.invitations.id, inv.id), eq(schema.invitations.status, 'pending')))
      .returning();
    if (claimed.length === 0) return deny('invitation_used', 'This invitation has already been used.');
    const [existing] = await tx.select().from(schema.memberships).where(and(eq(schema.memberships.userId, principal.userId), eq(schema.memberships.orgId, inv.orgId))).limit(1);
    if (existing) await tx.update(schema.memberships).set({ status: 'active', role: inv.proposedRole, updatedAt: now }).where(eq(schema.memberships.id, existing.id));
    else await tx.insert(schema.memberships).values({ userId: principal.userId, orgId: inv.orgId, role: inv.proposedRole, status: 'active' });
    await tx.update(schema.sessions).set({ activeTenantId: inv.orgId, termsAcceptedAt: now }).where(eq(schema.sessions.id, principal.sessionId));
    await audit(tx, { actorId: principal.userId, action: 'invitation.accept', resourceType: 'invitation', resourceId: inv.id, tenantId: inv.orgId, meta: { role: inv.proposedRole } });
    await notify(tx, { userId: inv.invitedBy, type: 'invitation_accepted', title: `${principal.email} joined your workspace`, link: '/w', dedupeKey: `inv-accepted:${inv.id}` });
    const [org] = await tx.select().from(schema.organisations).where(eq(schema.organisations.id, inv.orgId));
    return { ok: true as const, orgSlug: org.slug };
  });
}

// ───────── Team management (client admin, own tenant only) ─────────

export async function listTeam(principalIn: Principal | null) {
  const tenantId = principalIn?.activeTenantId ?? null;
  await enforce(principalIn, 'read', teamResource(tenantId));
  const principal = principalIn!;
  const members = await withSystemTx((tx) =>
    tx
      .select({ id: schema.memberships.id, userId: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.memberships.role, status: schema.memberships.status, since: schema.memberships.createdAt })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.orgId, tenantId!)),
  );
  const invitations = await withTenantTx(principal.userId, tenantId!, (tx) =>
    tx
      .select({ id: schema.invitations.id, email: schema.invitations.email, role: schema.invitations.proposedRole, status: schema.invitations.status, expiresAt: schema.invitations.expiresAt, usedAt: schema.invitations.usedAt })
      .from(schema.invitations)
      .orderBy(desc(schema.invitations.createdAt)),
  );
  return {
    members,
    invitations: invitations.map((i) => ({ ...i, state: i.status === 'pending' && i.expiresAt.getTime() < Date.now() ? 'expired' : i.status })),
  };
}

async function loadMemberInTenant(membershipId: string, tenantId: string) {
  const [m] = await withSystemTx((tx) => tx.select().from(schema.memberships).where(and(eq(schema.memberships.id, membershipId), eq(schema.memberships.orgId, tenantId))).limit(1));
  if (!m) throw notFound();
  return m;
}

export async function changeMemberRole(principalIn: Principal | null, membershipId: string, role: string) {
  const tenantId = principalIn?.activeTenantId ?? null;
  await enforce(principalIn, 'manage_client_roles', teamResource(tenantId));
  const principal = principalIn!;
  const newRole = await assertClientRole(principal, role, 'manage_client_roles');
  const m = await loadMemberInTenant(membershipId, tenantId!);
  if (m.userId === principal.userId) throw forbidden('cannot_change_own_role');
  await withSystemTx(async (tx) => {
    await tx.update(schema.memberships).set({ role: newRole, updatedAt: new Date() }).where(eq(schema.memberships.id, m.id));
    await revokeUserSessions(tx, m.userId);
    await audit(tx, { actorId: principal.userId, action: 'membership.change_role', resourceType: 'membership', resourceId: m.id, tenantId, meta: { from: m.role, to: newRole } });
  });
}

export async function revokeMember(principalIn: Principal | null, membershipId: string) {
  const tenantId = principalIn?.activeTenantId ?? null;
  await enforce(principalIn, 'manage_client_roles', teamResource(tenantId));
  const principal = principalIn!;
  const m = await loadMemberInTenant(membershipId, tenantId!);
  if (m.userId === principal.userId) throw forbidden('cannot_revoke_self');
  await withSystemTx(async (tx) => {
    await tx.update(schema.memberships).set({ status: 'revoked', updatedAt: new Date() }).where(eq(schema.memberships.id, m.id));
    await revokeUserSessions(tx, m.userId);
    await audit(tx, { actorId: principal.userId, action: 'membership.revoke', resourceType: 'membership', resourceId: m.id, tenantId });
  });
}
