import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { schema, withSystemTx, type Tx } from '@/lib/db';
import { hashToken, randomToken } from '@/lib/crypto';
import type { Principal } from '@/lib/policy/types';

export const SESSION_COOKIE = 'az_session';
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

export const cookieOptions = (maxAgeSec: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: maxAgeSec,
});

/** Database session (not stateless JWT) so revocation is immediate. Returns the raw token for the cookie. */
export async function createSession(
  tx: Tx,
  s: { userId: string; authMethod: 'microsoft' | 'magiclink'; amr?: string[]; authTime?: Date; activeTenantId?: string | null },
) {
  const token = randomToken();
  const now = new Date();
  await tx.insert(schema.sessions).values({
    tokenHash: hashToken(token),
    userId: s.userId,
    authMethod: s.authMethod,
    amr: s.amr ?? [],
    authTime: s.authTime ?? now,
    activeTenantId: s.activeTenantId ?? null,
    expiresAt: new Date(now.getTime() + ABSOLUTE_TIMEOUT_MS),
  });
  return token;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(ABSOLUTE_TIMEOUT_MS / 1000));
}

/** AUTH-10: any role/membership/grant change deletes the user's sessions; next request is unauthenticated. */
export async function revokeUserSessions(tx: Tx, userId: string) {
  await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

/** Load the full principal for a session token. Exported for tests; request code uses getPrincipal(). */
export async function principalFromToken(token: string | undefined | null, now = new Date()): Promise<Principal | null> {
  if (!token) return null;
  return withSystemTx(async (tx) => {
    const [session] = await tx.select().from(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token))).limit(1);
    if (!session) return null;
    const idleExpired = now.getTime() - session.lastSeenAt.getTime() > IDLE_TIMEOUT_MS;
    if (idleExpired || session.expiresAt.getTime() <= now.getTime()) {
      await tx.delete(schema.sessions).where(eq(schema.sessions.id, session.id));
      return null;
    }
    if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
      await tx.update(schema.sessions).set({ lastSeenAt: now }).where(eq(schema.sessions.id, session.id));
    }
    return loadPrincipal(tx, session, now);
  });
}

async function loadPrincipal(tx: Tx, session: typeof schema.sessions.$inferSelect, now: Date): Promise<Principal | null> {
  const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, session.userId)).limit(1);
  if (!user) return null;
  const memberships = await tx
    .select({
      orgId: schema.memberships.orgId,
      role: schema.memberships.role,
      status: schema.memberships.status,
      orgSlug: schema.organisations.slug,
      orgName: schema.organisations.name,
      orgType: schema.organisations.type,
    })
    .from(schema.memberships)
    .innerJoin(schema.organisations, eq(schema.organisations.id, schema.memberships.orgId))
    .where(eq(schema.memberships.userId, user.id));
  const grants = await tx
    .select({ grant: schema.grants.grant, scopeOrgId: schema.grants.scopeOrgId, scopeIdeaId: schema.grants.scopeIdeaId, expiresAt: schema.grants.expiresAt })
    .from(schema.grants)
    .where(and(eq(schema.grants.userId, user.id), isNull(schema.grants.revokedAt), or(isNull(schema.grants.expiresAt), gt(schema.grants.expiresAt, now))));

  // The active tenant must still be a valid active membership; otherwise it is dropped.
  const activeTenantId =
    session.activeTenantId && memberships.some((m) => m.orgId === session.activeTenantId && m.status === 'active') ? session.activeTenantId : null;

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    sessionId: session.id,
    activeTenantId,
    memberships,
    grants,
    authMethod: session.authMethod,
    amr: session.amr,
    authTime: session.authTime,
  };
}

/** Per-request principal from the httpOnly session cookie. */
export const getPrincipal = cache(async (): Promise<Principal | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return principalFromToken(token);
});

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  let method: string | null = null;
  if (token) {
    method = await withSystemTx(async (tx) => {
      const deleted = await tx.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token))).returning();
      return deleted[0]?.authMethod ?? null;
    });
  }
  jar.delete(SESSION_COOKIE);
  return method;
}

/** Switch workspace: only to an org where the user has an active membership. */
export async function setActiveTenant(principal: Principal, orgId: string) {
  const ok = principal.memberships.some((m) => m.orgId === orgId && m.status === 'active');
  if (!ok) return false;
  await withSystemTx((tx) => tx.update(schema.sessions).set({ activeTenantId: orgId }).where(eq(schema.sessions.id, principal.sessionId)));
  return true;
}

export async function markTermsAccepted(principal: Principal) {
  await withSystemTx((tx) => tx.update(schema.sessions).set({ termsAcceptedAt: new Date() }).where(eq(schema.sessions.id, principal.sessionId)));
}
