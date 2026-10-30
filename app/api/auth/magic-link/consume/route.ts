import { NextResponse } from 'next/server';
import { consumeMagicLink } from '@/lib/auth/magic';
import { cookieOptions, ABSOLUTE_TIMEOUT_MS, SESSION_COOKIE } from '@/lib/auth/session';
import { clientKey, route } from '@/lib/api';
import { appUrl } from '@/lib/settings';

const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : null);

/** POST-only (form) so link-scanning mail clients can't burn single-use tokens with a GET. */
export const POST = route(async (req: Request) => {
  const form = await req.formData();
  const token = String(form.get('token') ?? '');
  const next = safeNext(String(form.get('next') ?? ''));
  const r = await consumeMagicLink(token, clientKey(req));
  if (!r.ok) return NextResponse.redirect(new URL('/login?error=link_invalid', appUrl()), 303);
  const res = NextResponse.redirect(new URL(next ?? '/portal', appUrl()), 303);
  res.cookies.set(SESSION_COOKIE, r.sessionToken, cookieOptions(ABSOLUTE_TIMEOUT_MS / 1000));
  return res;
});
