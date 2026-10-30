import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { schema, withSystemTx, withTenantTx } from '@/lib/db';
import { HttpError } from '@/lib/http';
import type { Principal } from '@/lib/policy/types';

function requireUser(p: Principal | null): Principal {
  if (!p) throw new HttpError(401, 'unauthenticated');
  return p;
}

export async function listNotifications(principal: Principal | null) {
  const p = requireUser(principal);
  return withTenantTx(p.userId, p.activeTenantId, (tx) => tx.select().from(schema.notifications).orderBy(desc(schema.notifications.createdAt)).limit(50));
}

export async function unreadCount(principal: Principal | null) {
  if (!principal) return 0;
  const [r] = await withTenantTx(principal.userId, principal.activeTenantId, (tx) =>
    tx.select({ n: sql<number>`count(*)::int` }).from(schema.notifications).where(isNull(schema.notifications.readAt)),
  );
  return r?.n ?? 0;
}

export async function markAllRead(principal: Principal | null) {
  const p = requireUser(principal);
  await withTenantTx(p.userId, p.activeTenantId, (tx) => tx.update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.userId, p.userId), isNull(schema.notifications.readAt))));
}

/** Email outbox status for the current user, shown truthfully (queued ≠ sent ≠ delivered). */
export async function myEmailStatus(principal: Principal | null) {
  const p = requireUser(principal);
  return withSystemTx((tx) =>
    tx.select({ id: schema.outbox.id, status: schema.outbox.status, payload: schema.outbox.payload, createdAt: schema.outbox.createdAt }).from(schema.outbox).where(and(eq(schema.outbox.channel, 'email'), eq(schema.outbox.recipient, p.email))).orderBy(desc(schema.outbox.createdAt)).limit(10),
  );
}
