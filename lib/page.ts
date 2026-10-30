import { redirect } from 'next/navigation';
import { getPrincipal } from '@/lib/auth/session';
import { HttpError } from '@/lib/http';

/** Page-level: unauthenticated users go to /login. Authorization still happens in each service call. */
export async function requirePrincipal(next?: string) {
  const p = await getPrincipal();
  if (!p) redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  return p;
}

/** Runs a service call; HttpErrors become a renderable status instead of crashing the page. */
export async function guarded<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; status: number; message?: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, status: e.status, message: e.message !== e.code ? e.message : undefined };
    throw e;
  }
}
