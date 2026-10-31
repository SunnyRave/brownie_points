import { asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, withSystemTx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { enforce } from '@/lib/policy/enforce';
import { notFound } from '@/lib/http';
import { adminResource } from '@/lib/services/admin';
import { cancelRegistration, cancelToken } from '@/lib/services/public-forms';
import type { Principal } from '@/lib/policy/types';

/**
 * Demo requests and event registrations hold real visitors' contact details.
 * Portal administrators only; never indexed for search or sent to AIRA.
 */

export const LEAD_STATUSES = ['new', 'contacted', 'closed'] as const;
const leadStatusSchema = z.object({ status: z.enum(LEAD_STATUSES) });

export async function listEnquiries(principal: Principal | null) {
  await enforce(principal, 'manage_grants', adminResource);
  return withSystemTx(async (tx) => {
    const offerings = await tx.select({ id: schema.offerings.id, name: schema.offerings.name }).from(schema.offerings);
    const offeringName = new Map(offerings.map((o) => [o.id, o.name]));
    const leads = await tx.select().from(schema.leads).orderBy(desc(schema.leads.createdAt));
    const events = await tx.select().from(schema.events).orderBy(asc(schema.events.startsAt));
    const regs = await tx.select().from(schema.eventRegistrations).orderBy(asc(schema.eventRegistrations.createdAt));
    return {
      leads: leads.map((l) => ({
        id: l.id, name: l.name, email: l.email, company: l.company, message: l.message,
        offering: l.offeringInterest ? offeringName.get(l.offeringInterest) ?? l.offeringInterest : null,
        status: l.status, createdAt: l.createdAt.toISOString(), updatedAt: l.updatedAt.toISOString(),
      })),
      events: events.map((e) => {
        const rows = regs.filter((r) => r.eventId === e.id);
        return {
          id: e.id, title: e.title, startsAt: e.startsAt.toISOString(), capacity: e.capacity,
          registered: rows.filter((r) => r.status === 'registered').length,
          waitlisted: rows.filter((r) => r.status === 'waitlisted').length,
          registrations: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, team: r.team, status: r.status, createdAt: r.createdAt.toISOString() })),
        };
      }),
    };
  });
}

export async function updateLeadStatus(principal: Principal | null, id: string, raw: unknown) {
  await enforce(principal, 'manage_grants', { ...adminResource, id });
  const { status } = leadStatusSchema.parse(raw);
  return withSystemTx(async (tx) => {
    const [lead] = await tx.select().from(schema.leads).where(eq(schema.leads.id, id)).limit(1);
    if (!lead) throw notFound();
    await tx.update(schema.leads).set({ status, handledBy: principal!.userId, updatedAt: new Date() }).where(eq(schema.leads.id, id));
    await audit(tx, { actorId: principal!.userId, action: 'lead.status', resourceType: 'lead', resourceId: id, meta: { from: lead.status, to: status } });
    return { status };
  });
}

/** Admin removes a registration; same path as the visitor's own cancel, so the waitlist is promoted. */
export async function adminCancelRegistration(principal: Principal | null, id: string) {
  await enforce(principal, 'manage_grants', { ...adminResource, id });
  const result = await cancelRegistration({ token: cancelToken(id) });
  await withSystemTx((tx) => audit(tx, { actorId: principal!.userId, action: 'event_registration.admin_cancel', resourceType: 'event_registration', resourceId: id }));
  return result;
}
