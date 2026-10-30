import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { eq } from 'drizzle-orm';
import { schema, withSystemTx } from '@/lib/db';
import { randomToken, sha256b64url } from '@/lib/crypto';
import { audit } from '@/lib/audit';
import { appUrl } from '@/lib/settings';
import { createSession } from './session';
import { ensureEmployeeMembership } from './employees';

/**
 * Microsoft Entra ID, single-tenant, OIDC authorization-code flow with PKCE.
 * Users are keyed on the immutable `oid` claim; email is display-only.
 */

const tenantId = () => process.env.AZURE_AD_TENANT_ID ?? '';
export const expectedIssuer = (tid = tenantId()) => `https://login.microsoftonline.com/${tid}/v2.0`;
const authority = () => `https://login.microsoftonline.com/${tenantId()}/oauth2/v2.0`;
export const redirectUri = () => `${appUrl()}/api/auth/microsoft/callback`;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
const getJwks = () => (jwks ??= createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId()}/discovery/v2.0/keys`)));

export type EntraClaims = JWTPayload & {
  tid?: string;
  oid?: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  nonce?: string;
  amr?: string[];
  auth_time?: number;
  groups?: string[];
};

/** Pure claim validation (AT-18): reject unless tid and iss are exactly the Azentio tenant's, and oid is present. */
export function validateEntraClaims(claims: EntraClaims, expected: { tenantId: string; nonce?: string }):
  | { ok: true; oid: string; email: string; name: string }
  | { ok: false; reason: string } {
  if (!expected.tenantId) return { ok: false, reason: 'tenant_not_configured' };
  if (claims.tid !== expected.tenantId) return { ok: false, reason: 'tenant_mismatch' };
  if (claims.iss !== expectedIssuer(expected.tenantId)) return { ok: false, reason: 'issuer_mismatch' };
  if (expected.nonce !== undefined && claims.nonce !== expected.nonce) return { ok: false, reason: 'nonce_mismatch' };
  if (!claims.oid) return { ok: false, reason: 'missing_oid' };
  const email = (claims.email ?? claims.preferred_username ?? '').toLowerCase();
  return { ok: true, oid: claims.oid, email, name: claims.name ?? email };
}

export function buildAuthorizeRequest() {
  const state = randomToken(16);
  const nonce = randomToken(16);
  const verifier = randomToken(32);
  const params = new URLSearchParams({
    client_id: process.env.AZURE_AD_CLIENT_ID ?? '',
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    scope: 'openid profile email offline_access',
    state,
    nonce,
    code_challenge: sha256b64url(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return { url: `${authority()}/authorize?${params}`, state, nonce, verifier };
}

export async function exchangeCode(code: string, verifier: string) {
  const res = await fetch(`${authority()}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AZURE_AD_CLIENT_ID ?? '',
      client_secret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`token_exchange_failed:${res.status}`);
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error('no_id_token');
  // Signature, audience, expiry and issuer are verified here; tid/oid/nonce in validateEntraClaims.
  const { payload } = await jwtVerify(body.id_token, getJwks(), { issuer: expectedIssuer(), audience: process.env.AZURE_AD_CLIENT_ID });
  return payload as EntraClaims;
}

/** After a verified id_token: upsert by oid, decide employee approval, open a session. */
export async function completeEntraSignIn(claims: EntraClaims, nonce: string) {
  const v = validateEntraClaims(claims, { tenantId: tenantId(), nonce });
  if (!v.ok) {
    await withSystemTx((tx) => audit(tx, { actorId: null, action: 'auth.sign_in', resourceType: 'session', decision: 'deny', meta: { method: 'microsoft', reason: v.reason } }));
    return { ok: false as const, reason: v.reason };
  }
  return withSystemTx(async (tx) => {
    let [user] = await tx.select().from(schema.users).where(eq(schema.users.entraOid, v.oid)).limit(1);
    if (!user) {
      const [byEmail] = v.email ? await tx.select().from(schema.users).where(eq(schema.users.email, v.email)).limit(1) : [];
      if (byEmail && !byEmail.entraOid) {
        // Link a pre-provisioned record once; afterwards oid is the only key.
        [user] = await tx.update(schema.users).set({ entraOid: v.oid, name: v.name }).where(eq(schema.users.id, byEmail.id)).returning();
      } else {
        [user] = await tx.insert(schema.users).values({ entraOid: v.oid, email: v.email || `${v.oid}@entra.invalid`, name: v.name, emailVerifiedAt: new Date() }).returning();
      }
    }
    const groupId = process.env.EMPLOYEE_GROUP_ID;
    const groupApproved = !!groupId && Array.isArray(claims.groups) && claims.groups.includes(groupId);
    const approved = await ensureEmployeeMembership(tx, user, 'microsoft', { groupApproved });
    const sessionToken = await createSession(tx, {
      userId: user.id,
      authMethod: 'microsoft',
      amr: claims.amr ?? [],
      authTime: claims.auth_time ? new Date(claims.auth_time * 1000) : new Date(),
    });
    await audit(tx, { actorId: user.id, action: 'auth.sign_in', resourceType: 'session', meta: { method: 'microsoft', approved } });
    return { ok: true as const, sessionToken, approved };
  });
}

export function entraLogoutUrl() {
  return `${authority()}/logout?post_logout_redirect_uri=${encodeURIComponent(`${appUrl()}/login?signed_out=1`)}`;
}
