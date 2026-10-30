import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { schema, withSystemTx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { enforce } from '@/lib/policy/enforce';
import { hasGrant } from '@/lib/policy/authorize';
import { badRequest, forbidden, notFound } from '@/lib/http';
import { revokeUserSessions } from '@/lib/auth/session';
import { getAzentioOrg } from '@/lib/auth/employees';
import { getAuthMethods, getSetting } from '@/lib/settings';
import { grantSchema } from '@/lib/validation';
import { toOwnObservationDTO } from '@/lib/learning/dto';
import { hashToken, randomToken } from '@/lib/crypto';
import { queueEmail } from '@/lib/outbox';
import { appUrl } from '@/lib/settings';
import { INVITATION_TTL_MS } from '@/lib/auth/invitations';
import type { Principal } from '@/lib/policy/types';

export const adminResource = { type: 'admin_console', audience: { kind: 'grant' as const, grant: 'portal_admin' as const } };

const guard = (p: Principal | null) => enforce(p, 'manage_grants', adminResource);

/**
 * AUTH-12 (P1): privileged admin actions require recent MFA for Microsoft sessions.
 * Magic-link (demo) sessions are labelled as not MFA-verified in the UI rather than silently passing.
 */
export function mfaStatus(p: Principal) {
  const recent = Date.now() - p.authTime.getTime() < 60 * 60 * 1000;
  return { mfa: p.amr.includes('mfa'), recent, method: p.authMethod };
}
async function guardMfa(p: Principal | null) {
  await guard(p);
  if (p!.authMethod === 'microsoft') {
    const s = mfaStatus(p!);
    if (!s.mfa || !s.recent) throw forbidden('mfa_required', 'Re-authenticate with MFA (within the last hour) to perform admin actions.');
  }
}

export async function overview(principal: Principal | null) {
  await guard(principal);
  return withSystemTx(async (tx) => {
    const orgs = await tx.select().from(schema.organisations).orderBy(schema.organisations.name);
    const offerings = await tx.select({ id: schema.offerings.id, name: schema.offerings.name }).from(schema.offerings).orderBy(schema.offerings.name);
    const ents = await tx.select().from(schema.entitlements);
    const members = await tx.select({ orgId: schema.memberships.orgId, status: schema.memberships.status }).from(schema.memberships);
    return {
      orgs: orgs.map((o) => ({ ...o, members: members.filter((m) => m.orgId === o.id && m.status === 'active').length })),
      offerings,
      entitlements: ents.map((e) => ({ orgId: e.orgId, offeringId: e.offeringId, sandboxEnabled: e.sandboxEnabled })),
    };
  });
}

const orgSchema = z.object({ name: z.string().trim().min(2).max(120), slug: z.string().regex(/^[a-z0-9-]{2,40}$/), industry: z.string().max(80).optional(), region: z.string().max(80).optional() });

export async function createOrg(principal: Principal | null, raw: unknown) {
  await guardMfa(principal);
  const input = orgSchema.parse(raw);
  return withSystemTx(async (tx) => {
    const [org] = await tx.insert(schema.organisations).values({ ...input, type: 'client' }).returning();
    await audit(tx, { actorId: principal!.userId, action: 'org.create', resourceType: 'organisation', resourceId: org.id });
    return org;
  });
}

/** Per-tenant product entitlement: none / entitled / entitled with sandbox (IAM-07). */
export async function setEntitlement(principal: Principal | null, raw: unknown) {
  await guardMfa(principal);
  const input = z.object({ orgId: z.string(), offeringId: z.string(), state: z.enum(['none', 'entitled', 'sandbox']) }).parse(raw);
  await withSystemTx(async (tx) => {
    await tx.delete(schema.entitlements).where(and(eq(schema.entitlements.orgId, input.orgId), eq(schema.entitlements.offeringId, input.offeringId)));
    if (input.state !== 'none') await tx.insert(schema.entitlements).values({ orgId: input.orgId, offeringId: input.offeringId, sandboxEnabled: input.state === 'sandbox' });
    await audit(tx, { actorId: principal!.userId, action: 'entitlement.set', resourceType: 'entitlement', tenantId: input.orgId, meta: input });
  });
}

export async function listGrants(principal: Principal | null) {
  await guard(principal);
  return withSystemTx((tx) =>
    tx
      .select({ id: schema.grants.id, grant: schema.grants.grant, email: schema.users.email, name: schema.users.name, scopeOrgId: schema.grants.scopeOrgId, scopeIdeaId: schema.grants.scopeIdeaId, expiresAt: schema.grants.expiresAt, reason: schema.grants.reason, createdAt: schema.grants.createdAt })
      .from(schema.grants)
      .innerJoin(schema.users, eq(schema.users.id, schema.grants.userId))
      .where(isNull(schema.grants.revokedAt))
      .orderBy(desc(schema.grants.createdAt)),
  );
}

/**
 * IAM-05: each grant is separate and individually assignable, with a reason; sessions are revoked so it applies at once.
 * support_access (IAM-08) must be org-scoped and time-boxed (≤ 8 h).
 */
export async function assignGrant(principal: Principal | null, raw: unknown) {
  await guardMfa(principal);
  const input = grantSchema.parse(raw);
  if (input.grant === 'support_access') {
    if (!input.scopeOrgId) throw badRequest('support_access_requires_org');
    if (!input.expiresInHours || input.expiresInHours > 8) throw badRequest('support_access_must_be_time_boxed', 'Support access must expire within 8 hours.');
  }
  return withSystemTx(async (tx) => {
    const [user] = await tx.select().from(schema.users).where(eq(schema.users.email, input.email)).limit(1);
    if (!user) throw notFound('user_not_found');
    const azentio = await getAzentioOrg(tx);
    const [emp] = await tx.select().from(schema.memberships).where(and(eq(schema.memberships.userId, user.id), eq(schema.memberships.orgId, azentio.id), eq(schema.memberships.status, 'active')));
    if (!emp) throw forbidden('platform_grants_require_employee', 'Platform grants can only be assigned to approved Azentio employees.');
    const [g] = await tx
      .insert(schema.grants)
      .values({
        userId: user.id, grant: input.grant, scopeOrgId: input.scopeOrgId ?? null, scopeIdeaId: input.scopeIdeaId ?? null,
        expiresAt: input.expiresInHours ? new Date(Date.now() + input.expiresInHours * 3600_000) : null, reason: input.reason, grantedBy: principal!.userId,
      })
      .returning();
    if (user.id !== principal!.userId) await revokeUserSessions(tx, user.id);
    await audit(tx, { actorId: principal!.userId, action: 'grant.assign', resourceType: 'grant', resourceId: g.id, tenantId: input.scopeOrgId ?? null, meta: { grant: input.grant, to: user.id, reason: input.reason, expiresAt: g.expiresAt } });
    return { id: g.id };
  });
}

export async function revokeGrant(principal: Principal | null, grantId: string) {
  await guardMfa(principal);
  await withSystemTx(async (tx) => {
    const [g] = await tx.update(schema.grants).set({ revokedAt: new Date() }).where(and(eq(schema.grants.id, grantId), isNull(schema.grants.revokedAt))).returning();
    if (!g) throw notFound();
    if (g.grant === 'portal_admin') {
      const remaining = await tx.select({ id: schema.grants.id }).from(schema.grants).where(and(eq(schema.grants.grant, 'portal_admin'), isNull(schema.grants.revokedAt), ne(schema.grants.id, g.id)));
      if (!remaining.length) throw forbidden('last_admin', 'Cannot revoke the last portal administrator.');
    }
    if (g.userId !== principal!.userId) await revokeUserSessions(tx, g.userId);
    await audit(tx, { actorId: principal!.userId, action: 'grant.revoke', resourceType: 'grant', resourceId: g.id, meta: { grant: g.grant } });
  });
}

export async function listPeople(principal: Principal | null) {
  await guard(principal);
  return withSystemTx(async (tx) => {
    const allowlist = await tx.select().from(schema.employeeAllowlist).orderBy(schema.employeeAllowlist.emailOrOid);
    const pending = await tx
      .select({ id: schema.accessRequests.id, status: schema.accessRequests.status, createdAt: schema.accessRequests.createdAt, email: schema.users.email, name: schema.users.name, userId: schema.users.id })
      .from(schema.accessRequests)
      .innerJoin(schema.users, eq(schema.users.id, schema.accessRequests.userId))
      .orderBy(desc(schema.accessRequests.createdAt));
    return { allowlist, pending };
  });
}

export async function addToAllowlist(principal: Principal | null, raw: unknown) {
  await guardMfa(principal);
  const { value } = z.object({ value: z.string().trim().toLowerCase().min(3).max(254) }).parse(raw);
  await withSystemTx(async (tx) => {
    await tx.insert(schema.employeeAllowlist).values({ emailOrOid: value, approvedBy: principal!.userId }).onConflictDoNothing();
    await audit(tx, { actorId: principal!.userId, action: 'allowlist.add', resourceType: 'employee_allowlist', meta: { value } });
  });
}

export async function decideAccessRequest(principal: Principal | null, requestId: string, raw: unknown) {
  await guardMfa(principal);
  const { decision } = z.object({ decision: z.enum(['approved', 'denied']) }).parse(raw);
  await withSystemTx(async (tx) => {
    const [req] = await tx.update(schema.accessRequests).set({ status: decision, decidedAt: new Date() }).where(eq(schema.accessRequests.id, requestId)).returning();
    if (!req) throw notFound();
    if (decision === 'approved') {
      const org = await getAzentioOrg(tx);
      await tx.insert(schema.memberships).values({ userId: req.userId, orgId: org.id, role: 'employee', status: 'active' }).onConflictDoUpdate({ target: [schema.memberships.userId, schema.memberships.orgId], set: { status: 'active', updatedAt: new Date() } });
    }
    await revokeUserSessions(tx, req.userId);
    await audit(tx, { actorId: principal!.userId, action: `access_request.${decision}`, resourceType: 'access_request', resourceId: requestId });
  });
}

export async function getSettings(principal: Principal | null) {
  await guard(principal);
  return { kThreshold: await getSetting<number>('k_threshold', 3), authMethods: await getSetting<string[]>('auth_methods', ['microsoft', 'magiclink']), effectiveAuthMethods: await getAuthMethods() };
}

export async function updateSettings(principal: Principal | null, raw: unknown) {
  await guardMfa(principal);
  const input = z.object({ kThreshold: z.number().int().min(3, 'k must be at least 3').max(50), authMethods: z.array(z.enum(['microsoft', 'magiclink'])).min(1) }).parse(raw);
  await withSystemTx(async (tx) => {
    for (const [key, value] of [['k_threshold', input.kThreshold], ['auth_methods', input.authMethods]] as const) {
      await tx.insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
    }
    await audit(tx, { actorId: principal!.userId, action: 'settings.update', resourceType: 'settings', meta: input });
  });
}

export async function listAudit(principal: Principal | null, opts: { decision?: 'allow' | 'deny'; limit?: number }) {
  await guard(principal);
  return withSystemTx((tx) =>
    tx
      .select({ id: schema.auditEvents.id, action: schema.auditEvents.action, resourceType: schema.auditEvents.resourceType, resourceId: schema.auditEvents.resourceId, tenantId: schema.auditEvents.tenantId, decision: schema.auditEvents.decision, meta: schema.auditEvents.meta, createdAt: schema.auditEvents.createdAt, actor: schema.users.email })
      .from(schema.auditEvents)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditEvents.actorId))
      .where(opts.decision ? eq(schema.auditEvents.decision, opts.decision) : undefined)
      .orderBy(desc(schema.auditEvents.createdAt))
      .limit(Math.min(opts.limit ?? 100, 500)),
  );
}

/**
 * IAM-08: a portal admin sees a client's (non-draft, non-private) records only with an active,
 * org-scoped, time-boxed support_access grant. Every view is audited.
 */
export async function supportView(principal: Principal | null, orgId: string) {
  await enforce(principal, 'support_access', { type: 'support_view', id: orgId, audience: { kind: 'tenant', tenantId: orgId } });
  return withSystemTx(async (tx) => {
    const rows = await tx.select().from(schema.observations).where(and(eq(schema.observations.tenantId, orgId), ne(schema.observations.state, 'draft'), ne(schema.observations.visibilityIntent, 'private')));
    await audit(tx, { actorId: principal!.userId, action: 'support_access.view', resourceType: 'organisation', resourceId: orgId, tenantId: orgId, meta: { records: rows.length } });
    return rows.map((r) => toOwnObservationDTO(r, principal!.userId));
  });
}

export const hasSupportGrant = (p: Principal | null, orgId: string) => hasGrant(p, 'support_access', new Date(), { orgId });

/** Portal admins can invite the first client administrator into any client organisation. */
export async function adminInvite(principal: Principal | null, raw: unknown) {
  await guardMfa(principal);
  const input = z.object({ orgId: z.string(), email: z.string().trim().toLowerCase().email(), role: z.enum(['client_member', 'client_admin']) }).parse(raw);
  const token = randomToken();
  const url = `${appUrl()}/invite/${token}`;
  await withSystemTx(async (tx) => {
    const [org] = await tx.select().from(schema.organisations).where(and(eq(schema.organisations.id, input.orgId), eq(schema.organisations.type, 'client')));
    if (!org) throw notFound();
    const [inv] = await tx.insert(schema.invitations).values({ orgId: org.id, email: input.email, proposedRole: input.role, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITATION_TTL_MS), invitedBy: principal!.userId }).returning();
    await queueEmail(tx, { to: input.email, subject: `You have been invited to ${org.name} on azentio.ai`, text: `Accept within 7 days: ${url}`, dedupeKey: `invite:${inv.id}`, kind: 'invitation', link: url });
    await audit(tx, { actorId: principal!.userId, action: 'invitation.create', resourceType: 'invitation', resourceId: inv.id, tenantId: org.id, meta: { role: input.role, by: 'portal_admin' } });
  });
  return { url, emailStatus: 'queued' as const };
}
