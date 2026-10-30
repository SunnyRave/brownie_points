import { NextResponse } from 'next/server';
import { destroyCurrentSession } from '@/lib/auth/session';
import { entraLogoutUrl } from '@/lib/auth/entra';
import { appUrl } from '@/lib/settings';

/** Ends the portal session; Microsoft sessions are also ended at Entra (AUTH-11). */
export async function POST() {
  const method = await destroyCurrentSession();
  return NextResponse.redirect(method === 'microsoft' ? entraLogoutUrl() : new URL('/login?signed_out=1', appUrl()), 303);
}
