import { and, eq, gt, isNull } from 'drizzle-orm';
import { schema, withSystemTx, type Tx } from '@/lib/db';
import { hashToken, randomToken } from '@/lib/crypto';
import { queueEmail } from '@/lib/outbox';
import { audit } from '@/lib/audit';
import { appUrl } from '@/lib/settings';
import { HttpError } from '@/lib/http';
import { createSession } from './session';
import { assertNotLockedOut, rateLimit, recordFailure } from './ratelimit';
import { ensureEmployeeMembership, isAllowlisted } from './employees';

export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

/**
 * Issues a single-use, 15-minute sign-in link — but only for known, eligible identities.
 * The response is identical either way so the endpoint cannot be used to enumerate accounts.
 * An arbitrary external email never creates a user or tenant membership here.
 */
export async function requestSignInLink(email: string, clientKey: string): Promise<{ queued: boolean; outboxKey?: string }> {
  return withSystemTx(async (tx) => {
    await rateLimit(tx, `magic:ip:${clientKey}`, 20, 15 * 60 * 1000);
    await rateLimit(tx, `magic:email:${email}`, 5, 15 * 60 * 1000);
    const [user] = await tx.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    const eligible =
      (user && (await tx.select({ id: schema.memberships.id }).from(schema.memberships).where(and(eq(schema.memberships.userId, user.id), eq(schema.memberships.status, 'active'))).limit(1)).length > 0) ||
      (await isAllowlisted(tx, { email }));
    if (!eligible) return { queued: false };
    const token = randomToken();
    const [link] = await tx
      .insert(schema.magicLinks)
      .values({ email, tokenHash: hashToken(token), purpose: 'signin', expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS) })
      .returning();
    const url = `${appUrl()}/login/verify?token=${token}`;
    await queueEmail(tx, { to: email, subject: 'Your azentio.ai sign-in link', text: `Sign in (valid 15 minutes, single use): ${url}`, dedupeKey: `magic:${link.id}`, kind: 'magic_link', link: url });
    return { queued: true, outboxKey: `email:magic:${link.id}` };
  });
}

/** Sends a verification link to the invited address only (the invitee cannot change it). */
export async function requestInviteVerification(tx: Tx, invitation: { id: string; email: string }, rawInviteToken: string, clientKey: string) {
  await rateLimit(tx, `invite-verify:ip:${clientKey}`, 20, 15 * 60 * 1000);
  await rateLimit(tx, `invite-verify:${invitation.id}`, 5, 15 * 60 * 1000);
  const token = randomToken();
  const [link] = await tx
    .insert(schema.magicLinks)
    .values({ email: invitation.email, tokenHash: hashToken(token), purpose: 'invite', invitationId: invitation.id, expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS) })
    .returning();
  const url = `${appUrl()}/login/verify?token=${token}&next=${encodeURIComponent(`/invite/${rawInviteToken}`)}`;
  await queueEmail(tx, { to: invitation.email, subject: 'Verify your email to join a workspace on azentio.ai', text: `Verify (valid 15 minutes): ${url}`, dedupeKey: `invite-verify:${link.id}`, kind: 'invite_verify', link: url });
  return { outboxKey: `email:invite-verify:${link.id}` };
}

/**
 * Consumes a link exactly once (atomic conditional update) and opens a session.
 * Invite links create the user record for the verified address; nothing else creates users from email.
 */
export async function consumeMagicLink(token: string, clientKey: string) {
  return withSystemTx(async (tx) => {
    await assertNotLockedOut(tx, `magic:${clientKey}`);
    const now = new Date();
    const [link] = await tx
      .update(schema.magicLinks)
      .set({ usedAt: now })
      .where(and(eq(schema.magicLinks.tokenHash, hashToken(token)), isNull(schema.magicLinks.usedAt), gt(schema.magicLinks.expiresAt, now)))
      .returning();
    if (!link) {
      await recordFailure(tx, `magic:${clientKey}`);
      return { ok: false as const };
    }
    let [user] = await tx.select().from(schema.users).where(eq(schema.users.email, link.email)).limit(1);
    if (!user && link.purpose === 'invite') {
      [user] = await tx.insert(schema.users).values({ email: link.email, name: link.email.split('@')[0], emailVerifiedAt: now }).returning();
    }
    if (!user && (await isAllowlisted(tx, { email: link.email }))) {
      [user] = await tx.insert(schema.users).values({ email: link.email, name: link.email.split('@')[0], emailVerifiedAt: now }).returning();
    }
    if (!user) return { ok: false as const };
    if (!user.emailVerifiedAt) await tx.update(schema.users).set({ emailVerifiedAt: now }).where(eq(schema.users.id, user.id));

    // Organiser-approved employee provisioning: allow-list (not the email suffix) decides.
    await ensureEmployeeMembership(tx, user, 'magiclink');

    const memberships = await tx
      .select({ orgId: schema.memberships.orgId, type: schema.organisations.type })
      .from(schema.memberships)
      .innerJoin(schema.organisations, eq(schema.organisations.id, schema.memberships.orgId))
      .where(and(eq(schema.memberships.userId, user.id), eq(schema.memberships.status, 'active')));
    const clientOrgs = memberships.filter((m) => m.type === 'client');
    const sessionToken = await createSession(tx, {
      userId: user.id,
      authMethod: 'magiclink',
      amr: ['otp'],
      activeTenantId: clientOrgs.length === 1 ? clientOrgs[0].orgId : null,
    });
    await audit(tx, { actorId: user.id, action: 'auth.sign_in', resourceType: 'session', meta: { method: 'magiclink', purpose: link.purpose } });
    return { ok: true as const, sessionToken, purpose: link.purpose, userId: user.id };
  });
}

export function assertEmailMatches(verified: string, invited: string) {
  if (verified.trim().toLowerCase() !== invited.trim().toLowerCase()) throw new HttpError(403, 'invitation_email_mismatch', 'This invitation was issued to a different email address.');
}
