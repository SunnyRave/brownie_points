import { and, eq, gt, sql } from 'drizzle-orm';
import { schema, type Tx } from '@/lib/db';
import { HttpError } from '@/lib/http';

/** DB-backed sliding window: survives restarts and works across instances. */
export async function rateLimit(tx: Tx, key: string, max: number, windowMs: number) {
  const since = new Date(Date.now() - windowMs);
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.authAttempts)
    .where(and(eq(schema.authAttempts.key, key), gt(schema.authAttempts.createdAt, since)));
  if (n >= max) throw new HttpError(429, 'rate_limited', 'Too many attempts. Please wait and try again.');
  await tx.insert(schema.authAttempts).values({ key });
}

/** Lockout after repeated failures (e.g. invalid magic-link tokens from one client). */
export async function assertNotLockedOut(tx: Tx, key: string, maxFailures = 10, windowMs = 15 * 60 * 1000) {
  const since = new Date(Date.now() - windowMs);
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.authAttempts)
    .where(and(eq(schema.authAttempts.key, `fail:${key}`), gt(schema.authAttempts.createdAt, since)));
  if (n >= maxFailures) throw new HttpError(429, 'locked_out', 'Too many failed attempts. Try again in 15 minutes.');
}

export async function recordFailure(tx: Tx, key: string) {
  await tx.insert(schema.authAttempts).values({ key: `fail:${key}` });
}
