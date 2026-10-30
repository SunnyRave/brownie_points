'use client';

export type ApiError = { error: string; message?: string; issues?: { path: string; message: string }[] };

/** Same-origin JSON fetch; throws ApiError-shaped objects for non-2xx. */
export async function api<T = unknown>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...(data as ApiError) };
  return data as T;
}

export function errorText(e: unknown): string {
  const err = e as ApiError & { status?: number };
  if (err?.issues?.length) return err.issues.map((i) => `${i.path ? `${i.path}: ` : ''}${i.message}`).join(' · ');
  if (err?.status === 401) return 'Please sign in again.';
  if (err?.status === 403) return err.message && err.message !== err.error ? err.message : `Not permitted (${err.error}).`;
  return err?.message ?? err?.error ?? 'Something went wrong.';
}
