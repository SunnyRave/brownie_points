import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, like } from 'drizzle-orm';
import { db, expectHttp, loginAs } from '../helpers';
import { DEMO_USERS as U } from '@/scripts/seed-data';

let D: Awaited<ReturnType<typeof db>>;
let pub: typeof import('@/lib/services/public-forms');
let enq: typeof import('@/lib/services/enquiries');
let n = 0;
const key = () => `test-${n++}`;

beforeAll(async () => {
  D = await db();
  pub = await import('@/lib/services/public-forms');
  enq = await import('@/lib/services/enquiries');
  await D.withSystemTx((tx) => tx.insert(D.schema.events).values({ slug: 'tiny-test-event', title: 'Tiny test event', description: 'Two places only.', capacity: 2, startsAt: new Date(Date.now() + 7 * 86400_000) }));
});

const reg = (email: string) => pub.registerForEvent(null, 'tiny-test-event', { name: 'Test Person', email }, key());

describe('visitor event registration', () => {
  it('registers, then waitlists when full, and a repeat email never reveals the confirmation', async () => {
    const a = await reg('a@visitor.example');
    const b = await reg('b@visitor.example');
    const c = await reg('c@visitor.example');
    expect([a.status, b.status, c.status]).toEqual(['registered', 'registered', 'waitlisted']);
    expect(a.confirmation).toMatch(/^[0-9A-F-]{8}$/);
    const again = await reg('a@visitor.example');
    expect(again).toEqual({ status: 'already_registered', confirmation: null });
    const ev = await pub.getEvent('tiny-test-event');
    expect(ev).toMatchObject({ registered: 2, waitlisted: 1, remaining: 0 });
  });

  it('cancel link: viewing changes nothing; confirming frees the place and promotes the waitlist with an email', async () => {
    const [aRow] = await D.withSystemTx((tx) => tx.select().from(D.schema.eventRegistrations).where(eq(D.schema.eventRegistrations.email, 'a@visitor.example')));
    const [cRow] = await D.withSystemTx((tx) => tx.select().from(D.schema.eventRegistrations).where(eq(D.schema.eventRegistrations.email, 'c@visitor.example')));
    const token = pub.cancelToken(aRow.id);
    expect((await pub.lookupCancellation(token)).status).toBe('registered');
    expect((await pub.getEvent('tiny-test-event'))!.registered).toBe(2);

    expect(await pub.cancelRegistration({ token })).toEqual({ status: 'cancelled', already: false });
    expect(await pub.cancelRegistration({ token })).toEqual({ status: 'cancelled', already: true });
    const [promoted] = await D.withSystemTx((tx) => tx.select().from(D.schema.eventRegistrations).where(eq(D.schema.eventRegistrations.id, cRow.id)));
    expect(promoted.status).toBe('registered');
    const mail = await D.withSystemTx((tx) => tx.select().from(D.schema.outbox).where(eq(D.schema.outbox.dedupeKey, `email:event:${cRow.id}:promoted`)));
    expect(mail).toHaveLength(1);
  });

  it('forged or tampered cancel links are refused', async () => {
    await expectHttp(pub.cancelRegistration({ token: 'not-a-real-id.forgedsignature' }), 403, 'invalid_link');
    const [bRow] = await D.withSystemTx((tx) => tx.select().from(D.schema.eventRegistrations).where(eq(D.schema.eventRegistrations.email, 'b@visitor.example')));
    const [, sig] = pub.cancelToken(bRow.id).split('.');
    await expectHttp(pub.lookupCancellation(`${bRow.id.slice(0, -1)}x.${sig}`), 403);
  });
});

describe('admin enquiries', () => {
  it('only portal admins can see demo requests and registrations', async () => {
    await pub.submitLead(null, { name: 'Vera Visitor', email: 'vera@visitor.example', company: 'Visitor Bank', consent: true, startedAt: Date.now() - 5000 }, key());
    await expectHttp(enq.listEnquiries(null), 401);
    for (const p of [await loginAs(U.employee), await loginAs(U.moderator), await loginAs(U.publisher), await loginAs(U.northwindAdmin, 'northwind')]) {
      await expectHttp(enq.listEnquiries(p), 403);
    }
    const data = await enq.listEnquiries(await loginAs(U.admin));
    expect(data.leads.some((l) => l.email === 'vera@visitor.example' && l.status === 'new')).toBe(true);
    expect(data.events.find((e) => e.title === 'Tiny test event')!.registrations.length).toBe(3);
  });

  it('lead status changes are audited; registrations can be cancelled by an admin', async () => {
    const admin = await loginAs(U.admin);
    const lead = (await enq.listEnquiries(admin)).leads.find((l) => l.email === 'vera@visitor.example')!;
    await enq.updateLeadStatus(admin, lead.id, { status: 'contacted' });
    const audits = await D.withSystemTx((tx) => tx.select().from(D.schema.auditEvents).where(and(eq(D.schema.auditEvents.action, 'lead.status'), eq(D.schema.auditEvents.resourceId, lead.id))));
    expect(audits[0].meta).toMatchObject({ from: 'new', to: 'contacted' });
    await expect(enq.updateLeadStatus(admin, lead.id, { status: 'won' })).rejects.toThrow(); // validation → 400 at the route

    const [bRow] = await D.withSystemTx((tx) => tx.select().from(D.schema.eventRegistrations).where(eq(D.schema.eventRegistrations.email, 'b@visitor.example')));
    expect((await enq.adminCancelRegistration(admin, bRow.id)).status).toBe('cancelled');
    await expectHttp(enq.adminCancelRegistration(await loginAs(U.employee), bRow.id), 403);
  });

  it('RLS: contact details are invisible outside system mode', async () => {
    const emp = await loginAs(U.employee);
    const leads = await D.withTenantTx(emp.userId, null, (tx) => tx.select().from(D.schema.leads).where(like(D.schema.leads.email, '%visitor.example')));
    const regs = await D.withTenantTx(emp.userId, null, (tx) => tx.select().from(D.schema.eventRegistrations));
    expect(leads).toHaveLength(0);
    expect(regs).toHaveLength(0);
  });
});
