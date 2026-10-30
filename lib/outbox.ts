import { eq, and, lt } from 'drizzle-orm';
import { schema, withSystemTx, type Tx } from '@/lib/db';

/**
 * In-app notification + persisted outbox record in the caller's transaction.
 * The outbox dedupe_key makes delivery idempotent; writing the in-app row is the delivery.
 */
export async function notify(
  tx: Tx,
  n: { userId: string; type: string; title: string; body?: string; link?: string; dedupeKey: string },
) {
  const inserted = await tx
    .insert(schema.outbox)
    .values({ channel: 'inapp', dedupeKey: `inapp:${n.dedupeKey}`, recipient: n.userId, payload: { type: n.type, title: n.title }, status: 'delivered' })
    .onConflictDoNothing()
    .returning({ id: schema.outbox.id });
  if (inserted.length === 0) return; // already delivered
  await tx.insert(schema.notifications).values({ userId: n.userId, type: n.type, title: n.title, body: n.body ?? '', link: n.link ?? null });
}

/** Queues an email. Status stays "queued" until a provider accepts it ("sent"); "delivered" only via provider webhook. */
export async function queueEmail(tx: Tx, e: { to: string; subject: string; text: string; dedupeKey: string; kind: string; link?: string }) {
  await tx
    .insert(schema.outbox)
    .values({ channel: 'email', dedupeKey: `email:${e.dedupeKey}`, recipient: e.to, payload: { subject: e.subject, text: e.text, kind: e.kind, link: e.link ?? null }, status: 'queued' })
    .onConflictDoNothing();
}

export const emailProviderConfigured = () => !!process.env.RESEND_API_KEY;

/** Worker: hand queued emails to the provider. Without a provider nothing changes — they stay "queued". */
export async function processEmailOutbox(limit = 20) {
  if (!emailProviderConfigured()) return { processed: 0, provider: false };
  const queued = await withSystemTx((tx) =>
    tx.select().from(schema.outbox).where(and(eq(schema.outbox.channel, 'email'), eq(schema.outbox.status, 'queued'), lt(schema.outbox.attempts, 5))).limit(limit),
  );
  for (const item of queued) {
    const p = item.payload as { subject: string; text: string };
    let status: 'sent' | 'queued' | 'failed' = 'queued';
    let lastError: string | null = null;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': item.dedupeKey },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, to: item.recipient, subject: p.subject, text: p.text }),
      });
      if (res.ok) status = 'sent';
      else lastError = `provider ${res.status}`;
    } catch (err) {
      lastError = String(err);
    }
    if (item.attempts + 1 >= 5 && status !== 'sent') status = 'failed';
    await withSystemTx((tx) =>
      tx.update(schema.outbox).set({ status, attempts: item.attempts + 1, lastError, updatedAt: new Date() }).where(eq(schema.outbox.id, item.id)),
    );
  }
  return { processed: queued.length, provider: true };
}
