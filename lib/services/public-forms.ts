import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, withSystemTx, type Tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { sign, verifySignature } from '@/lib/crypto';
import { appUrl } from '@/lib/settings';
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
    const counts = await countByStatus(tx, ev.id);
    return { ...ev, registered: counts.registered, waitlisted: counts.waitlisted, remaining: Math.max(0, ev.capacity - counts.registered) };
  });
}

async function countByStatus(tx: Tx, eventId: string) {
  const rows = await tx
    .select({ status: schema.eventRegistrations.status, n: sql<number>`count(*)::int` })
    .from(schema.eventRegistrations)
    .where(eq(schema.eventRegistrations.eventId, eventId))
    .groupBy(schema.eventRegistrations.status);
  const get = (k: string) => rows.find((r) => r.status === k)?.n ?? 0;
  return { registered: get('registered'), waitlisted: get('waitlisted') };
}

const confirmationCode = (id: string) => id.slice(0, 8).toUpperCase();

/** Single-use in practice: the link only works while the registration is active. Signed, so it can't be guessed. */
export const cancelToken = (registrationId: string) => `${registrationId}.${sign(`event-cancel:${registrationId}`)}`;

function parseCancelToken(token: string) {
  const [id, sig] = token.split('.');
  if (!id || !sig || !verifySignature(`event-cancel:${id}`, sig)) throw new HttpError(403, 'invalid_link', 'This cancellation link is not valid.');
  return id;
}

type Ev = typeof schema.events.$inferSelect;
type Reg = typeof schema.eventRegistrations.$inferSelect;

async function sendRegistrationEmail(tx: Tx, ev: Ev, reg: Reg, kind: 'confirmed' | 'waitlisted' | 'promoted' | 'reminder') {
  const when = ev.startsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const cancel = `${appUrl()}/hackathon/cancel?token=${encodeURIComponent(cancelToken(reg.id))}`;
  const headline = {
    confirmed: `You're registered for ${ev.title}.`,
    waitlisted: `${ev.title} is full, so you're on the waitlist. We'll email you if a place opens up.`,
    promoted: `Good news: a place opened up and you're now registered for ${ev.title}.`,
    reminder: reg.status === 'waitlisted' ? `You're on the waitlist for ${ev.title}.` : `You're registered for ${ev.title}.`,
  }[kind];
  const text = [
    `Hi ${reg.name},`, '', headline, '',
    `Date: ${when}`, `Confirmation: ${confirmationCode(reg.id)}`, reg.team ? `Team: ${reg.team}` : null, '',
    `Can't make it? Cancel here so someone on the waitlist can take your place: ${cancel}`,
  ].filter((l) => l !== null).join('\n');
  const subject = kind === 'waitlisted' ? `Waitlist: ${ev.title}` : kind === 'promoted' ? `You're in: ${ev.title}` : `Registration: ${ev.title}`;
  const day = new Date().toISOString().slice(0, 10);
  await queueEmail(tx, { to: reg.email, subject, text, dedupeKey: `event:${reg.id}:${kind}${kind === 'reminder' ? `:${day}` : ''}`, kind: 'event_confirmation', link: cancel });
}

/**
 * PUB-05: capacity enforced inside the transaction. When full, people join a waitlist.
 * A repeat email never reveals the existing confirmation: it re-sends it to that inbox instead.
 */
export async function registerForEvent(principal: Principal | null, slug: string, raw: unknown, clientKey: string) {
  await enforce(principal, 'create', { type: 'event_registration', audience: { kind: 'public' } });
  const input = eventRegistrationSchema.parse(raw);
  return withSystemTx(async (tx) => {
    await rateLimit(tx, `event:${clientKey}`, 10, 60 * 60 * 1000);
    const [ev] = await tx.select().from(schema.events).where(eq(schema.events.slug, slug)).for('update').limit(1);
    if (!ev) throw notFound();
    const counts = await countByStatus(tx, ev.id);
    const status = counts.registered < ev.capacity ? ('registered' as const) : ('waitlisted' as const);
    const [existing] = await tx.select().from(schema.eventRegistrations).where(and(eq(schema.eventRegistrations.eventId, ev.id), eq(schema.eventRegistrations.email, input.email)));
    if (existing && existing.status !== 'cancelled') {
      await sendRegistrationEmail(tx, ev, existing, 'reminder');
      return { status: 'already_registered' as const, confirmation: null };
    }
    let reg: Reg;
    if (existing) {
      [reg] = await tx.update(schema.eventRegistrations).set({ name: input.name, team: input.team ?? null, status, cancelledAt: null, createdAt: new Date() }).where(eq(schema.eventRegistrations.id, existing.id)).returning();
    } else {
      [reg] = await tx.insert(schema.eventRegistrations).values({ eventId: ev.id, name: input.name, email: input.email, team: input.team ?? null, status }).returning();
    }
    await sendRegistrationEmail(tx, ev, reg, status === 'registered' ? 'confirmed' : 'waitlisted');
    return { status, confirmation: confirmationCode(reg.id) };
  });
}

/** What the cancel page shows before the visitor confirms. GET never changes anything (mail scanners). */
export async function lookupCancellation(token: string) {
  const id = parseCancelToken(token);
  return withSystemTx(async (tx) => {
    const [row] = await tx
      .select({ reg: schema.eventRegistrations, title: schema.events.title, startsAt: schema.events.startsAt })
      .from(schema.eventRegistrations)
      .innerJoin(schema.events, eq(schema.events.id, schema.eventRegistrations.eventId))
      .where(eq(schema.eventRegistrations.id, id));
    if (!row) throw notFound();
    return { eventTitle: row.title, startsAt: row.startsAt.toISOString(), name: row.reg.name, status: row.reg.status, confirmation: confirmationCode(row.reg.id) };
  });
}

/** Cancels via the signed link; a freed place goes to the longest-waiting person, who is emailed. */
export async function cancelRegistration(raw: unknown) {
  const { token } = z.object({ token: z.string().min(10).max(300) }).parse(raw);
  const id = parseCancelToken(token);
  return withSystemTx(async (tx) => {
    const [reg] = await tx.select().from(schema.eventRegistrations).where(eq(schema.eventRegistrations.id, id)).limit(1);
    if (!reg) throw notFound();
    const [ev] = await tx.select().from(schema.events).where(eq(schema.events.id, reg.eventId)).for('update').limit(1);
    if (reg.status === 'cancelled') return { status: 'cancelled' as const, already: true };
    await tx.update(schema.eventRegistrations).set({ status: 'cancelled', cancelledAt: new Date() }).where(eq(schema.eventRegistrations.id, reg.id));
    await audit(tx, { actorId: null, action: 'event_registration.cancel', resourceType: 'event_registration', resourceId: reg.id, meta: { event: ev.slug, was: reg.status } });
    if (reg.status === 'registered') {
      const [next] = await tx
        .select()
        .from(schema.eventRegistrations)
        .where(and(eq(schema.eventRegistrations.eventId, ev.id), eq(schema.eventRegistrations.status, 'waitlisted')))
        .orderBy(asc(schema.eventRegistrations.createdAt))
        .limit(1);
      if (next) {
        const [promoted] = await tx.update(schema.eventRegistrations).set({ status: 'registered' }).where(eq(schema.eventRegistrations.id, next.id)).returning();
        await sendRegistrationEmail(tx, ev, promoted, 'promoted');
        await audit(tx, { actorId: null, action: 'event_registration.promote', resourceType: 'event_registration', resourceId: next.id, meta: { event: ev.slug } });
      }
    }
    return { status: 'cancelled' as const, already: false };
  });
}
