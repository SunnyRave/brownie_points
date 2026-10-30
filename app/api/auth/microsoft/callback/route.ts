import { NextResponse, type NextRequest } from 'next/server';
import { completeEntraSignIn, exchangeCode } from '@/lib/auth/entra';
import { verifySignature } from '@/lib/crypto';
import { cookieOptions, ABSOLUTE_TIMEOUT_MS, SESSION_COOKIE } from '@/lib/auth/session';
import { appUrl } from '@/lib/settings';

export async function GET(req: NextRequest) {
  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${reason}`, appUrl()));
    res.cookies.delete('az_oidc');
    return res;
  };
  const raw = req.cookies.get('az_oidc')?.value;
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  if (!raw || !code || !state) return fail('oidc_state');
  const [b64, sig] = raw.split('.');
  const payload = Buffer.from(b64, 'base64url').toString();
  if (!verifySignature(payload, sig)) return fail('oidc_state');
  const stored = JSON.parse(payload) as { state: string; nonce: string; verifier: string; t: number };
  if (stored.state !== state || Date.now() - stored.t > 600_000) return fail('oidc_state');
  try {
    const claims = await exchangeCode(code, stored.verifier);
    const result = await completeEntraSignIn(claims, stored.nonce);
    if (!result.ok) return fail(result.reason);
    const res = NextResponse.redirect(new URL(result.approved ? '/hub' : '/access-pending', appUrl()));
    res.cookies.set(SESSION_COOKIE, result.sessionToken, cookieOptions(ABSOLUTE_TIMEOUT_MS / 1000));
    res.cookies.delete('az_oidc');
    return res;
  } catch (err) {
    console.error('Entra sign-in failed', err);
    return fail('microsoft_failed');
  }
}
