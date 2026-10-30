import { NextResponse } from 'next/server';
import { buildAuthorizeRequest } from '@/lib/auth/entra';
import { getAuthMethods } from '@/lib/settings';
import { sign } from '@/lib/crypto';

export async function GET() {
  if (!(await getAuthMethods()).includes('microsoft')) return NextResponse.redirect(new URL('/login?error=microsoft_disabled', process.env.APP_URL ?? 'http://localhost:3000'));
  const { url, state, nonce, verifier } = buildAuthorizeRequest();
  const payload = JSON.stringify({ state, nonce, verifier, t: Date.now() });
  const res = NextResponse.redirect(url);
  res.cookies.set('az_oidc', `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth/microsoft', maxAge: 600 });
  return res;
}
