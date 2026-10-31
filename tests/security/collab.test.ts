import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db, expectHttp, loginAs, orgId } from '../helpers';
import { DEMO_USERS as U } from '@/scripts/seed-data';

process.env.ATTACHMENT_STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'azentio-att-'));

type Svc = {
  sup: typeof import('@/lib/services/support');
  att: typeof import('@/lib/services/attachments');
  teams: typeof import('@/lib/services/teams');
  obs: typeof import('@/lib/services/observations');
  mod: typeof import('@/lib/services/moderation');
  ins: typeof import('@/lib/insights');
  search: typeof import('@/lib/search');
};
let s: Svc;
let D: Awaited<ReturnType<typeof db>>;

beforeAll(async () => {
  D = await db();
  s = {
    sup: await import('@/lib/services/support'),
    att: await import('@/lib/services/attachments'),
    teams: await import('@/lib/services/teams'),
    obs: await import('@/lib/services/observations'),
    mod: await import('@/lib/services/moderation'),
    ins: await import('@/lib/insights'),
    search: await import('@/lib/search'),
  };
});

const draft = {
  type: 'market_observation', confidence: 'medium', topic: 'Seasonality', industry: 'SME lending', region: 'Europe',
  periodStart: '2026-01-01', periodEnd: '2026-03-31', title: 'Attachment test observation', body: 'Synthetic body text describing a seasonal cash-flow observation in enough detail to pass validation.',
};
const consents = { storeProcess: true, publishShared: true, attribution: false, trainingProgramme: false };
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer <<>>\n%%EOF\n');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const CSV = new TextEncoder().encode('month,inflow\nJan,100\nFeb,80\n');

describe('support tickets (§06)', () => {
  it('tickets are isolated by tenant: service 404/403 and raw RLS returns 0 rows', async () => {
    const noah = await loginAs(U.northwindMember, 'northwind');
    const { ticket } = await s.sup.createTicket(noah, { subject: 'Northwind private ticket', category: 'access', priority: 'normal', body: 'Please help with access for a colleague.' });

    const hugo = await loginAs(U.harborMember, 'harbor');
    expect((await s.sup.listTicketsForClient(hugo)).find((t) => t.id === ticket.id)).toBeUndefined();
    expect((await s.sup.listTicketsForClient(hugo)).every((t) => !t.subject.startsWith('Northwind'))).toBe(true);
    await expectHttp(s.sup.getTicketForClient(hugo, ticket.id), 404);
    await expectHttp(s.sup.replyAsClient(hugo, ticket.id, { body: 'Injected reply' }), 404);
    await expectHttp(s.sup.closeTicketAsClient(hugo, ticket.id), 404);
    // Forged active tenant without membership → 403.
    await expectHttp(s.sup.getTicketForClient({ ...hugo, activeTenantId: await orgId('northwind') }, ticket.id), 403);

    const raw = await D.withTenantTx(hugo.userId, hugo.activeTenantId, (tx) => tx.select().from(D.schema.supportTickets).where(eq(D.schema.supportTickets.id, ticket.id)));
    expect(raw).toHaveLength(0);
    const forged = await D.withTenantTx(hugo.userId, await orgId('northwind'), (tx) => tx.select().from(D.schema.supportTicketMessages).where(eq(D.schema.supportTicketMessages.ticketId, ticket.id)));
    expect(forged).toHaveLength(0);

    // A colleague in the same org can see and reply.
    const nina = await loginAs(U.northwindAdmin, 'northwind');
    const view = await s.sup.getTicketForClient(nina, ticket.id);
    expect(view.messages).toHaveLength(1);
    await s.sup.replyAsClient(nina, ticket.id, { body: 'Adding detail from the admin.' });
  });

  it('a client member cannot post as Azentio or as someone else (RLS with-check)', async () => {
    const noah = await loginAs(U.northwindMember, 'northwind');
    const { ticket } = await s.sup.createTicket(noah, { subject: 'RLS author-side test', category: 'other', body: 'Testing author side.' });
    await expect(
      D.withTenantTx(noah.userId, noah.activeTenantId, (tx) => tx.insert(D.schema.supportTicketMessages).values({ ticketId: ticket.id, tenantId: noah.activeTenantId!, authorId: noah.userId, authorSide: 'azentio', body: 'Fake support reply' })),
    ).rejects.toThrow();
    const nina = await loginAs(U.northwindAdmin, 'northwind');
    await expect(
      D.withTenantTx(noah.userId, noah.activeTenantId, (tx) => tx.insert(D.schema.supportTicketMessages).values({ ticketId: ticket.id, tenantId: noah.activeTenantId!, authorId: nina.userId, authorSide: 'client', body: 'Impersonated' })),
    ).rejects.toThrow();
  });

  it('only support agents open the desk; employees, moderators and clients get 403', async () => {
    await expectHttp(s.sup.listDeskTickets(await loginAs(U.employee)), 403);
    await expectHttp(s.sup.listDeskTickets(await loginAs(U.moderator)), 403);
    await expectHttp(s.sup.listDeskTickets(await loginAs(U.northwindAdmin, 'northwind')), 403);
    await expectHttp(s.sup.listDeskTickets(null), 401);
    const ada = await loginAs(U.admin);
    const all = await s.sup.listDeskTickets(ada);
    const orgs = new Set(all.map((t) => t.orgName));
    expect(orgs.has('Northwind Bank')).toBe(true);
    expect(orgs.has('Harbor Credit Union')).toBe(true);
    const waiting = await s.sup.listDeskTickets(ada, { status: 'waiting_on_client' });
    expect(waiting.length).toBeGreaterThan(0);
    expect(waiting.every((t) => t.status === 'waiting_on_client')).toBe(true);
  });

  it('agent reply + status change are audited and notify the client who raised the ticket', async () => {
    const noah = await loginAs(U.northwindMember, 'northwind');
    const { ticket } = await s.sup.createTicket(noah, { subject: 'Audit and notify test', category: 'product_question', priority: 'high', body: 'Question about a product.' });
    const ada = await loginAs(U.admin);
    // New client ticket notified the support agent.
    const agentNotes = await D.withSystemTx((tx) => tx.select().from(D.schema.notifications).where(and(eq(D.schema.notifications.userId, ada.userId), eq(D.schema.notifications.type, 'support_ticket'))));
    expect(agentNotes.some((n) => n.link === `/hub/support/${ticket.id}`)).toBe(true);

    await s.sup.replyAsAgent(ada, ticket.id, { body: 'Here is the answer.', status: 'waiting_on_client' });
    await s.sup.setTicketStatus(ada, ticket.id, { status: 'resolved' });
    await expectHttp(s.sup.setTicketStatus(await loginAs(U.employee), ticket.id, { status: 'closed' }), 403);

    const audits = await D.withSystemTx((tx) => tx.select().from(D.schema.auditEvents).where(and(eq(D.schema.auditEvents.resourceId, ticket.id), eq(D.schema.auditEvents.action, 'support.status_change'))));
    expect(audits.map((a) => (a.meta as { to: string }).to)).toEqual(expect.arrayContaining(['waiting_on_client', 'resolved']));
    expect(audits.every((a) => a.actorId === ada.userId)).toBe(true);
    const notes = await D.withSystemTx((tx) => tx.select().from(D.schema.notifications).where(and(eq(D.schema.notifications.userId, noah.userId), eq(D.schema.notifications.type, 'support_status'))));
    expect(notes.filter((n) => n.link === `/w/_/support/${ticket.id}`).length).toBeGreaterThanOrEqual(2);

    const view = await s.sup.getTicketForClient(noah, ticket.id);
    expect(view.ticket.status).toBe('resolved');
    expect(view.messages.map((m) => m.authorSide)).toEqual(['client', 'azentio']);
    // Client reply re-opens a resolved ticket; closing then blocks further replies.
    await s.sup.replyAsClient(noah, ticket.id, { body: 'One more question.' });
    expect((await s.sup.getTicketForClient(noah, ticket.id)).ticket.status).toBe('open');
    await s.sup.closeTicketAsClient(noah, ticket.id);
    await expectHttp(s.sup.replyAsClient(noah, ticket.id, { body: 'After close' }), 409);
  });

  it('flags likely account numbers and never indexes tickets for search', async () => {
    const noah = await loginAs(U.northwindMember, 'northwind');
    const r = await s.sup.createTicket(noah, { subject: 'Account question', category: 'other', body: 'Customer account 123456789012 shows the wrong balance.' });
    expect(r.flags).toContain('account_number');
    const docs = await D.withSystemTx((tx) => tx.select().from(D.schema.searchDocuments).where(eq(D.schema.searchDocuments.sourceId, r.ticket.id)));
    expect(docs).toHaveLength(0);
    const hits = await s.search.search(noah, 'Account question');
    expect(hits.results.find((h) => h.sourceId === r.ticket.id)).toBeUndefined();
  });

  it('employees acting from the Azentio workspace cannot raise client tickets', async () => {
    const alex = await loginAs(U.employee, 'azentio');
    await expectHttp(s.sup.createTicket(alex, { subject: 'Internal', category: 'other', body: 'Not a client.' }), 403);
  });
});

describe('observation attachments (OBS-09)', () => {
  it('type, size, author and state rules; tenant + visibility on download; delete only while draft', async () => {
    const noah = await loginAs(U.northwindMember, 'northwind');
    const nina = await loginAs(U.northwindAdmin, 'northwind');
    const hugo = await loginAs(U.harborMember, 'harbor');
    const o = await s.obs.createDraft(noah, draft);

    await expectHttp(s.att.uploadAttachment(noah, o.id, { filename: 'evil.pdf', bytes: new TextEncoder().encode('<html><script>alert(1)</script>') }), 415);
    await expectHttp(s.att.uploadAttachment(noah, o.id, { filename: 'disguised.png', bytes: PDF }), 415); // extension must match bytes
    await expectHttp(s.att.uploadAttachment(noah, o.id, { filename: 'binary.txt', bytes: new Uint8Array([0x41, 0x00, 0x42]) }), 415);
    await expectHttp(s.att.uploadAttachment(noah, o.id, { filename: 'run.exe', bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]) }), 415);
    await expectHttp(s.att.uploadAttachment(noah, o.id, { filename: 'big.csv', bytes: new Uint8Array(s.att.ATTACHMENT_MAX_BYTES + 1).fill(0x61) }), 413);

    const pdf = await s.att.uploadAttachment(noah, o.id, { filename: '../../etc/Q1 evidence.pdf', bytes: PDF });
    expect(pdf.filename).toBe('Q1 evidence.pdf');
    expect(pdf.contentType).toBe('application/pdf');
    const png = await s.att.uploadAttachment(noah, o.id, { filename: 'chart.png', bytes: PNG });
    await s.att.uploadAttachment(noah, o.id, { filename: 'data.csv', bytes: CSV });
    const [stored] = await D.withSystemTx((tx) => tx.select().from(D.schema.observationAttachments).where(eq(D.schema.observationAttachments.id, pdf.id)));
    expect(stored.storageKey).not.toContain('evidence');
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.existsSync(path.join(process.env.ATTACHMENT_STORAGE_DIR!, stored.tenantId, stored.storageKey))).toBe(true);

    // Non-author colleague can't see a draft at all (404), other tenant gets 404, forged tenant 403.
    await expectHttp(s.att.uploadAttachment(nina, o.id, { filename: 'x.pdf', bytes: PDF }), 404);
    await expectHttp(s.att.listAttachments(nina, o.id), 404);
    await expectHttp(s.att.downloadAttachment(nina, pdf.id), 404);
    await expectHttp(s.att.downloadAttachment(hugo, pdf.id), 404);
    await expectHttp(s.att.downloadAttachment({ ...hugo, activeTenantId: await orgId('northwind') }, pdf.id), 403);
    const rawOther = await D.withTenantTx(hugo.userId, hugo.activeTenantId, (tx) => tx.select().from(D.schema.observationAttachments));
    expect(rawOther.find((a) => a.id === pdf.id)).toBeUndefined();

    const dl = await s.att.downloadAttachment(noah, pdf.id);
    expect(Buffer.from(dl.body).equals(Buffer.from(PDF))).toBe(true);
    const res = s.att.attachmentResponse(dl);
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="Q1 evidence.pdf"/);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');

    // Delete works on a draft and is audited.
    await expectHttp(s.att.deleteAttachment(nina, png.id), 404);
    await s.att.deleteAttachment(noah, png.id);
    const audits = await D.withSystemTx((tx) => tx.select().from(D.schema.auditEvents).where(eq(D.schema.auditEvents.resourceId, png.id)));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['attachment.upload', 'attachment.delete']));

    // Shared with the org: colleagues can now download, but not upload or delete; after submit the author can't delete either.
    await s.obs.submitObservation(noah, o.id, { visibilityIntent: 'org', consents: { ...consents, publishShared: false } });
    const asColleague = await s.att.downloadAttachment(nina, pdf.id);
    expect(asColleague.filename).toBe('Q1 evidence.pdf');
    await expectHttp(s.att.uploadAttachment(nina, o.id, { filename: 'x.pdf', bytes: PDF }), 403, 'not_author');
    await expectHttp(s.att.deleteAttachment(nina, pdf.id), 403);
    await expectHttp(s.att.deleteAttachment(noah, pdf.id), 409);
    await expectHttp(s.att.uploadAttachment(noah, o.id, { filename: 'late.pdf', bytes: PDF }), 409);
    // RLS independently refuses the delete once the record has left draft/returned.
    const rawDelete = await D.withTenantTx(noah.userId, noah.activeTenantId, (tx) => tx.delete(D.schema.observationAttachments).where(eq(D.schema.observationAttachments.id, pdf.id)).returning());
    expect(rawDelete).toHaveLength(0);
  });

  it('enforces a per-record count limit', async () => {
    const noah = await loginAs(U.northwindMember, 'northwind');
    const o = await s.obs.createDraft(noah, { ...draft, title: 'Count limit observation' });
    for (let i = 0; i < s.att.ATTACHMENT_MAX_COUNT; i++) await s.att.uploadAttachment(noah, o.id, { filename: `f${i}.txt`, bytes: new TextEncoder().encode(`note ${i}`) });
    await expectHttp(s.att.uploadAttachment(noah, o.id, { filename: 'one-too-many.txt', bytes: new TextEncoder().encode('x') }), 409, 'attachment_limit');
  });

  it('moderators see attachments only for submitted propose-shared records; shared copies never carry them', async () => {
    const noah = await loginAs(U.northwindMember, 'northwind');
    const maya = await loginAs(U.moderator);
    const priv = await s.obs.createDraft(noah, { ...draft, title: 'Private draft with file' });
    const privFile = await s.att.uploadAttachment(noah, priv.id, { filename: 'secret.pdf', bytes: PDF });
    await expectHttp(s.att.listAttachmentsForModerator(maya, priv.id), 404);
    await expectHttp(s.att.downloadAttachmentForModerator(maya, privFile.id), 404);
    const raw = await D.withModeratorTx(maya.userId, (tx) => tx.select().from(D.schema.observationAttachments).where(eq(D.schema.observationAttachments.id, privFile.id)));
    expect(raw).toHaveLength(0);

    const orgOnly = await s.obs.createDraft(noah, { ...draft, title: 'Org-only with file' });
    const orgFile = await s.att.uploadAttachment(noah, orgOnly.id, { filename: 'org.csv', bytes: CSV });
    await s.obs.submitObservation(noah, orgOnly.id, { visibilityIntent: 'org', consents: { ...consents, publishShared: false } });
    await expectHttp(s.att.listAttachmentsForModerator(maya, orgOnly.id), 404);
    await expectHttp(s.att.downloadAttachmentForModerator(maya, orgFile.id), 404);

    const prop = await s.obs.createDraft(noah, { ...draft, title: 'Proposed for sharing with evidence' });
    const propFile = await s.att.uploadAttachment(noah, prop.id, { filename: 'evidence-ATTACHMENT-MARKER.pdf', bytes: PDF });
    await s.obs.submitObservation(noah, prop.id, { visibilityIntent: 'propose_shared', consents });
    await expectHttp(s.att.listAttachmentsForModerator(await loginAs(U.employee), prop.id), 403);
    const list = await s.att.listAttachmentsForModerator(maya, prop.id);
    expect(list.map((a) => a.id)).toEqual([propFile.id]);
    const dl = await s.att.downloadAttachmentForModerator(maya, propFile.id);
    expect(dl.contentType).toBe('application/pdf');

    // Approve → the shared copy and community feed contain only reviewed fields, never attachments.
    await s.mod.getReviewItem(maya, prop.id);
    const res = await s.mod.decide(maya, prop.id, {
      decision: 'approve', authorReason: 'Approved.',
      shared: { title: 'Proposed for sharing with evidence', body: draft.body, regionGeneralised: 'Europe', periodQuarter: '2026 Q1', topic: 'Seasonality', showAttribution: false, themeId: null },
    });
    const hugo = await loginAs(U.harborMember, 'harbor');
    const dto = await s.ins.getSharedInsight(hugo, res.sharedInsightId!);
    const feed = await s.ins.communityFeed(hugo, {});
    for (const blob of [JSON.stringify(dto), JSON.stringify(feed)]) {
      expect(blob).not.toContain(propFile.id);
      expect(blob).not.toContain('ATTACHMENT-MARKER');
      expect(blob).not.toMatch(/attachment/i);
    }
    const [sharedRow] = await D.withSystemTx((tx) => tx.select().from(D.schema.sharedInsights).where(eq(D.schema.sharedInsights.id, res.sharedInsightId!)));
    expect(JSON.stringify(sharedRow)).not.toContain('ATTACHMENT-MARKER');
    // Other tenants still cannot fetch the source attachment.
    await expectHttp(s.att.downloadAttachment(hugo, propFile.id), 404);
  });
});

describe('hackathon team spaces (§05)', () => {
  it('clients and anonymous are refused on every entry point', async () => {
    const nina = await loginAs(U.northwindAdmin, 'northwind');
    const [space] = await s.teams.listSpaces(await loginAs(U.employee));
    await expectHttp(s.teams.listSpaces(nina), 403);
    await expectHttp(s.teams.getSpace(nina, space.id), 403);
    await expectHttp(s.teams.createSpace(nina, { name: 'Client team', challenge: 'Should never be created.' }), 403);
    await expectHttp(s.teams.joinSpace(nina, space.id), 403);
    await expectHttp(s.teams.postToSpace(nina, space.id, { kind: 'note', body: 'hello' }), 403);
    await expectHttp(s.teams.listSpaces(null), 401);
    await expectHttp(s.teams.getSpace(null, space.id), 401);
    // Raw RLS: team tables are system-mode only.
    const raw = await D.withTenantTx(nina.userId, nina.activeTenantId, (tx) => tx.select().from(D.schema.teamSpaces));
    expect(raw).toHaveLength(0);
  });

  it('membership gates posting; only owners change status (forward-only) or remove members', async () => {
    const alex = await loginAs(U.employee);
    const omar = await loginAs(U.owner);
    const space = await s.teams.createSpace(alex, { name: 'Test Team', challenge: 'A synthetic hackathon challenge.' });
    expect((await s.teams.getSpace(alex, space.id)).myRole).toBe('owner');

    await expectHttp(s.teams.postToSpace(omar, space.id, { kind: 'update', body: 'Not a member yet' }), 403, 'not_member');
    await s.teams.joinSpace(omar, space.id);
    await s.teams.postToSpace(omar, space.id, { kind: 'update', body: 'Now I am in' });
    await expect(s.teams.postToSpace(omar, space.id, { kind: 'link', body: 'javascript:alert(1)' })).rejects.toThrow(/http\(s\) URL/); // ZodError → 400 at the route

    await expectHttp(s.teams.setSpaceStatus(omar, space.id, { status: 'building' }), 403, 'not_owner');
    await expectHttp(s.teams.setSpaceStatus(alex, space.id, { status: 'submitted' }), 409);
    await s.teams.setSpaceStatus(alex, space.id, { status: 'building' });
    const audits = await D.withSystemTx((tx) => tx.select().from(D.schema.auditEvents).where(and(eq(D.schema.auditEvents.resourceId, space.id), eq(D.schema.auditEvents.action, 'team_space.status_change'))));
    expect(audits).toHaveLength(1);

    await expectHttp(s.teams.removeMember(omar, space.id, alex.userId), 403);
    await expectHttp(s.teams.leaveSpace(alex, space.id), 409, 'last_owner');
    await s.teams.removeMember(alex, space.id, omar.userId);
    expect((await s.teams.getSpace(omar, space.id)).myRole).toBeNull();

    await s.teams.setSpaceStatus(alex, space.id, { status: 'archived' });
    await expectHttp(s.teams.postToSpace(alex, space.id, { kind: 'note', body: 'after archive' }), 409);
  });

  it('team spaces are never indexed for search', async () => {
    const docs = await D.withSystemTx((tx) => tx.select().from(D.schema.searchDocuments));
    expect(docs.some((d) => d.sourceType.includes('team'))).toBe(false);
  });
});
