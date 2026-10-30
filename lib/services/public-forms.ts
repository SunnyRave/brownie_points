import { and, eq, sql } from 'drizzle-orm';
import { schema, withSystemTx } from '@/lib/db';
import { enforce } from '@/lib/policy/enforce';
import { HttpError, notFound } from '@/lib/http';
import { queueEmail } from '@/lib/outbox';
import { rateLimit } from '@/lib/auth/ratelimit';
import { eventRegistrationSchema, leadSchema } from '@/lib/validation';
import type { Principal } from '@/lib/policy/types';

/** PUB-04: validated, consented, honeypot + time-trap + rate limit, stored lead. */
export async function submitLead(principal: Principal | null, raw: unknown, clientKey: string) {
  await enforce(principal, 'create', { type: 'lead', audience: { kind: 'public' } });
  const input = leadSchema.parse(raw);
  if (Date.now() - input.startedAt < 2000) throw new HttpError(400, 'too_fast', 'Please take a moment to complete the form.');
  return withSystemTx(async (tx) => {
    await rateLimit(tx, `lead:${clientKey}`, 5, 60 * 60 * 1000);
    const [lead] = await tx.insert(schema.leads).values({ name: input.name, email: input.email, company: input.company, offeringInterest: input.offeringInterest ?? null, message: input.message ?? null, consent: input.consent }).returning();
    await queueEmail(tx, { to: input.email, subject: 'We received your azentio.ai demo request', text: `Thanks ${input.name}, our team will be in touch.`, dedupeKey: `lead:${lead.id}`, kind: 'lead_ack' });
    return { id: lead.id, emailStatus: 'queued' as const };
  });
}

export async function getEvent(slug: string) {
  return withSystemTx(async (tx) => {
    const [ev] = await tx.select().from(schema.events).where(eq(schema.events.slug, slug)).limit(1);
    if (!ev) return null;
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.eventRegistrations).where(eq(schema.eventRegistrations.eventId, ev.id));
    return { ...ev, registered: n, remaining: Math.max(0, ev.capacity - n) };
  });
}

/** PUB-05: capacity enforced inside the transaction; duplicate emails get the existing confirmation. */
export async function registerForEvent(principal: Principal | null, slug: string, raw: unknown, clientKey: string) {
  await enforce(principal, 'create', { type: 'event_registration', audience: { kind: 'public' } });
  const input = eventRegistrationSchema.parse(raw);
  return withSystemTx(async (tx) => {
    await rateLimit(tx, `event:${clientKey}`, 10, 60 * 60 * 1000);
    const [ev] = await tx.select().from(schema.events).where(eq(schema.events.slug, slug)).for('update').limit(1);
    if (!ev) throw notFound();
    const [existing] = await tx.select().from(schema.eventRegistrations).where(and(eq(schema.eventRegistrations.eventId, ev.id), eq(schema.eventRegistrations.email, input.email)));
    if (existing) return { confirmation: existing.id.slice(0, 8).toUpperCase(), duplicate: true };
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.eventRegistrations).where(eq(schema.eventRegistrations.eventId, ev.id));
    if (n >= ev.capacity) throw new HttpError(409, 'event_full', 'This event is at capacity.');
    const [reg] = await tx.insert(schema.eventRegistrations).values({ eventId: ev.id, name: input.name, email: input.email, team: input.team ?? null }).returning();
    await queueEmail(tx, { to: input.email, subject: `Registration: ${ev.title}`, text: `Confirmation ${reg.id.slice(0, 8).toUpperCase()}`, dedupeKey: `event:${reg.id}`, kind: 'event_confirmation' });
    return { confirmation: reg.id.slice(0, 8).toUpperCase(), duplicate: false };
  });
}
