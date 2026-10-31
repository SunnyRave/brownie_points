import { schema, type Tx } from '@/lib/db';
import type { Refs } from './refs';

const ago = (h: number) => new Date(Date.now() - h * 3600_000);

/** Synthetic seed data for the collab features. Must only insert (runs once per database). */
export async function seedCollab(tx: Tx, refs: Refs) {
  const { users: u, orgs } = refs;
  const northwind = orgs.northwind;
  const harbor = orgs.harbor;

  // ── Support tickets (tenant-private; desk = support_agent grant holders)
  if (northwind && u.northwindMember && u.northwindAdmin && u.admin) {
    const [t1] = await tx
      .insert(schema.supportTickets)
      .values({ tenantId: northwind.id, createdBy: u.northwindMember.id, subject: 'Colleague can’t open the SME cash-flow sandbox', category: 'sandbox', priority: 'normal', status: 'waiting_on_client', createdAt: ago(52), updatedAt: ago(20) })
      .returning();
    await tx.insert(schema.supportTicketMessages).values([
      { ticketId: t1.id, tenantId: northwind.id, authorId: u.northwindMember.id, authorSide: 'client', body: 'A new analyst on our team sees “not entitled” when opening the SME cash-flow sandbox. I can open it fine. Is there something we need to enable?', createdAt: ago(52) },
      { ticketId: t1.id, tenantId: northwind.id, authorId: u.admin.id, authorSide: 'azentio', body: 'Thanks for raising this. Sandbox access follows your organisation’s entitlement plus an active membership. Could you confirm your colleague accepted their invitation and switched to the Northwind workspace? If so, ask them to sign out and back in, then reply here.', createdAt: ago(20) },
    ]);
    const [t2] = await tx
      .insert(schema.supportTickets)
      .values({ tenantId: northwind.id, createdBy: u.northwindAdmin.id, subject: 'How long does community review usually take?', category: 'contribution', priority: 'low', status: 'open', createdAt: ago(6), updatedAt: ago(6) })
      .returning();
    await tx.insert(schema.supportTicketMessages).values({ ticketId: t2.id, tenantId: northwind.id, authorId: u.northwindAdmin.id, authorSide: 'client', body: 'We proposed an observation for the shared community last week. Is there a typical turnaround for moderation, and will we be told if it is returned?', createdAt: ago(6) });
  }
  if (harbor && u.harborMember) {
    const [t3] = await tx
      .insert(schema.supportTickets)
      .values({ tenantId: harbor.id, createdBy: u.harborMember.id, subject: 'Magic-link email arriving late', category: 'access', priority: 'high', status: 'in_progress', createdAt: ago(30), updatedAt: ago(28) })
      .returning();
    await tx.insert(schema.supportTicketMessages).values({ ticketId: t3.id, tenantId: harbor.id, authorId: u.harborMember.id, authorSide: 'client', body: 'Sign-in links sometimes take 10+ minutes to arrive and have expired by then. Could you check whether our mail filter is delaying them?', createdAt: ago(30) });
  }

  // ── Hackathon team spaces (employee-only)
  if (u.employee && u.owner && u.admin) {
    const [s1] = await tx
      .insert(schema.teamSpaces)
      .values({ name: 'Cash-flow Copilots', challenge: 'Explain seasonal SME cash-flow dips in plain language for relationship managers, using only synthetic data and the public scenario library.', status: 'building', createdBy: u.employee.id, createdAt: ago(96), updatedAt: ago(3) })
      .returning();
    await tx.insert(schema.teamSpaceMembers).values([
      { spaceId: s1.id, userId: u.employee.id, role: 'owner', createdAt: ago(96) },
      { spaceId: s1.id, userId: u.owner.id, role: 'member', createdAt: ago(90) },
    ]);
    await tx.insert(schema.teamSpacePosts).values([
      { spaceId: s1.id, authorId: u.employee.id, kind: 'update', body: 'Kick-off done. We are scoping a three-step explanation card: signal → likely cause → suggested next question.', createdAt: ago(72) },
      { spaceId: s1.id, authorId: u.owner.id, kind: 'note', body: 'Reminder: keep everything on synthetic data. No client observations in prompts or demos.', createdAt: ago(48) },
      { spaceId: s1.id, authorId: u.employee.id, kind: 'link', body: 'https://azentio.ai/hackathon Event rules and judging criteria', createdAt: ago(3) },
    ]);

    const [s2] = await tx
      .insert(schema.teamSpaces)
      .values({ name: 'Claims Triage Lab', challenge: 'Prototype a reviewer-in-the-loop triage view for insurance claims that shows why each claim was routed, with a one-click override.', status: 'forming', createdBy: u.admin.id, createdAt: ago(24), updatedAt: ago(24) })
      .returning();
    await tx.insert(schema.teamSpaceMembers).values({ spaceId: s2.id, userId: u.admin.id, role: 'owner', createdAt: ago(24) });
    await tx.insert(schema.teamSpacePosts).values({ spaceId: s2.id, authorId: u.admin.id, kind: 'update', body: 'Looking for one more person with UI skills — join if you are interested!', createdAt: ago(24) });
  }
}
