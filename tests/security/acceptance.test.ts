import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { db, expectHttp, loginAs, orgId } from '../helpers';
import { DEMO_USERS as U } from '@/scripts/seed-data';

type Svc = {
  obs: typeof import('@/lib/services/observations');
  mod: typeof import('@/lib/services/moderation');
  ins: typeof import('@/lib/insights');
  ideas: typeof import('@/lib/services/ideas');
  content: typeof import('@/lib/services/content');
  admin: typeof import('@/lib/services/admin');
  inv: typeof import('@/lib/auth/invitations');
  search: typeof import('@/lib/search');
  aira: typeof import('@/lib/aira');
  notif: typeof import('@/lib/services/notifications');
  play: typeof import('@/lib/services/playground');
};
let s: Svc;
let D: Awaited<ReturnType<typeof db>>;

const draft = {
  type: 'market_observation', confidence: 'medium', topic: 'Seasonality', industry: 'SME lending', region: 'Europe',
  periodStart: '2026-01-01', periodEnd: '2026-03-31', title: 'A synthetic seasonal observation', body: 'Synthetic body text describing a seasonal cash-flow observation in enough detail to pass validation.',
};
const consents = { storeProcess: true, publishShared: true, attribution: false, trainingProgramme: false };

beforeAll(async () => {
  D = await db();
  s = {
    obs: await import('@/lib/services/observations'),
    mod: await import('@/lib/services/moderation'),
    ins: await import('@/lib/insights'),
    ideas: await import('@/lib/services/ideas'),
    content: await import('@/lib/services/content'),
    admin: await import('@/lib/services/admin'),
    inv: await import('@/lib/auth/invitations'),
    search: await import('@/lib/search'),
    aira: await import('@/lib/aira'),
    notif: await import('@/lib/services/notifications'),
    play: await import('@/lib/services/playground'),
  };
});

async function collect(gen: AsyncGenerator<{ type: string; text?: string; citations?: unknown[] }>) {
  let text = '';
  let citations: unknown[] = [];
  for await (const e of gen) {
    if (e.type === 'text') text += e.text;
    if (e.type === 'citations') citations = e.citations!;
  }
  return { text, citations };
}

describe('tenant isolation', () => {
  it('AT-02: Client A cannot read Client B observation — service 404 and RLS returns 0 rows even without app filters', async () => {
    const harborMember = await loginAs(U.harborMember, 'harbor');
    const mine = await s.obs.listObservations(harborMember, 'mine');
    const harborObsId = mine[0].id;

    const northwind = await loginAs(U.northwindMember, 'northwind');
    await expectHttp(s.obs.getObservation(northwind, harborObsId), 404);
    // Forged tenant: principal claims Harbor but has no membership there.
    const forged = { ...northwind, activeTenantId: await orgId('harbor') };
    await expectHttp(s.obs.getObservation(forged, harborObsId), 403);
    // Raw RLS: unfiltered select in Northwind's context sees no Harbor rows.
    const rows = await D.withTenantTx(northwind.userId, northwind.activeTenantId, (tx) => tx.select().from(D.schema.observations));
    expect(rows.every((r) => r.tenantId === northwind.activeTenantId)).toBe(true);
    const leaked = await D.withTenantTx(northwind.userId, await orgId('harbor'), (tx) => tx.select().from(D.schema.observations).where(eq(D.schema.observations.id, harborObsId)));
    expect(leaked).toHaveLength(0); // RLS also requires an active membership in the context tenant
  });

  it('a query with no tenant context at all returns zero tenant rows', async () => {
    const rows = await D.withCtx({ userId: null, tenantId: null, mode: 'user' }, (tx) => tx.select().from(D.schema.observations));
    expect(rows).toHaveLength(0);
  });

  it('audit and consent history are append-only for the application role', async () => {
    await expect(D.withSystemTx((tx) => tx.execute(sql`delete from audit_events`))).rejects.toThrow();
    await expect(D.withSystemTx((tx) => tx.execute(sql`update consents set publish_shared = true`))).rejects.toThrow();
  });

  it('CLI-03: sandbox runs are isolated per tenant + user, and entitlement gates sandboxes', async () => {
    const nw = await loginAs(U.northwindMember, 'northwind');
    await s.play.runScenario(nw, 'client', { scenarioId: 'seasonal-sme', inputs: {} });
    const hb = await loginAs(U.harborMember, 'harbor');
    expect(await s.play.listRuns(hb, 'client')).toHaveLength(0);
    const mer = await loginAs(U.meridianMember, 'meridian'); // FAI entitled but sandbox disabled
    await expectHttp(s.play.runScenario(mer, 'client', { scenarioId: 'seasonal-sme', inputs: {} }), 403, 'not_entitled');
    await expectHttp(s.play.runScenario(nw, 'employee', { scenarioId: 'seasonal-sme', inputs: {} }), 403);
  });
});

describe('access boundaries', () => {
  it('AT-01: anonymous cannot read employee broadcasts or mint media URLs; forged/expired signatures refused', async () => {
    const list = await s.content.listBroadcasts(null);
    expect(list.every((b) => b.audience?.kind === 'public')).toBe(true);
    const all = await D.withSystemTx((tx) => tx.select().from(D.schema.broadcasts));
    const internal = all.find((b) => b.audience?.kind === 'employee')!;
    await expectHttp(s.content.getBroadcast(null, internal.id), 401);
    await expectHttp(s.content.mintMediaUrl(null, internal.recordingMediaId!), 401);
    await expectHttp(s.content.readSignedMedia(internal.recordingMediaId!, String(Math.floor(Date.now() / 1000) + 60), 'forged'), 403, 'invalid_signature');
    const emp = await loginAs(U.employee);
    const { url } = await s.content.mintMediaUrl(emp, internal.recordingMediaId!);
    const q = new URL(url, 'http://x').searchParams;
    const ok = await s.content.readSignedMedia(internal.recordingMediaId!, q.get('exp'), q.get('sig'));
    expect(ok.contentType).toBe('image/svg+xml');
    await expectHttp(s.content.readSignedMedia(internal.recordingMediaId!, String(Number(q.get('exp')) - 3600), q.get('sig')), 403);
  });

  it('AT-03: content with no audience is hidden from every persona', async () => {
    for (const p of [null, await loginAs(U.admin), await loginAs(U.employee), await loginAs(U.northwindAdmin, 'northwind')]) {
      const lib = await s.content.listContent(p, 'library');
      expect(lib.find((c) => c.title.startsWith('Orphaned'))).toBeUndefined();
    }
  });

  it('AT-04: employee without publisher grant cannot edit the homepage banner', async () => {
    await expectHttp(s.content.updateBanner(await loginAs(U.employee), { title: 'Hacked banner', body: 'x' }), 403);
    await s.content.updateBanner(await loginAs(U.publisher), { title: 'Registrations open', body: 'Join us' });
  });

  it('AT-20: a non-admin employee is refused the admin console', async () => {
    await expectHttp(s.admin.overview(await loginAs(U.employee)), 403);
    await expectHttp(s.admin.overview(await loginAs(U.moderator)), 403);
    expect((await s.admin.overview(await loginAs(U.admin))).orgs.length).toBeGreaterThan(3);
  });

  it('AT-05: client admin assigning moderator/employee role is rejected and audited', async () => {
    const nina = await loginAs(U.northwindAdmin, 'northwind');
    for (const role of ['moderator', 'employee', 'portal_admin']) {
      await expectHttp(s.inv.createInvitation(nina, { email: 'new@northwind.example', role }), 403, 'role_not_assignable');
    }
    const team = await s.inv.listTeam(nina);
    const noah = team.members.find((m) => m.email === U.northwindMember)!;
    await expectHttp(s.inv.changeMemberRole(nina, noah.id, 'moderator'), 403);
    const denials = await D.withSystemTx((tx) =>
      tx.select().from(D.schema.auditEvents).where(and(eq(D.schema.auditEvents.decision, 'deny'), eq(D.schema.auditEvents.actorId, nina.userId))),
    );
    expect(denials.filter((d) => (d.meta as { reason?: string }).reason === 'role_not_assignable').length).toBeGreaterThanOrEqual(4);
    // A plain member cannot invite at all.
    await expectHttp(s.inv.createInvitation(await loginAs(U.northwindMember, 'northwind'), { email: 'x@northwind.example', role: 'client_member' }), 403);
  });

  it('AT-06: invitations are single-use, expiring and bound to the verified email', async () => {
    const nina = await loginAs(U.northwindAdmin, 'northwind');
    const { url } = await s.inv.createInvitation(nina, { email: U.consultant, role: 'client_member' });
    const token = url.split('/invite/')[1];
    // Different verified email → rejected
    const wrong = await s.inv.acceptInvitation(await loginAs(U.harborMember, 'harbor'), token, { terms: true, sharingExplainer: true });
    expect(wrong).toMatchObject({ ok: false, code: 'invitation_email_mismatch' });
    // Correct email → accepted once
    const right = await s.inv.acceptInvitation(await loginAs(U.consultant), token, { terms: true, sharingExplainer: true });
    expect(right).toMatchObject({ ok: true, orgSlug: 'northwind' });
    const again = await s.inv.acceptInvitation(await loginAs(U.consultant), token, { terms: true, sharingExplainer: true });
    expect(again).toMatchObject({ ok: false, code: 'invitation_used' });
    // Expired
    const { url: url2 } = await s.inv.createInvitation(nina, { email: 'late@northwind.example', role: 'client_member' });
    const token2 = url2.split('/invite/')[1];
    await D.withSystemTx((tx) => tx.update(D.schema.invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(D.schema.invitations.email, 'late@northwind.example')));
    expect((await s.inv.getInvitationByToken(token2))?.state).toBe('expired');
  });

  it('AT-10 (sessions): role change revokes the affected user’s sessions', async () => {
    const nina = await loginAs(U.northwindAdmin, 'northwind');
    const noahSession = await loginAs(U.northwindMember, 'northwind');
    const { principalFromToken } = await import('@/lib/auth/session');
    const team = await s.inv.listTeam(nina);
    const noah = team.members.find((m) => m.email === U.northwindMember)!;
    await s.inv.changeMemberRole(nina, noah.id, 'client_admin');
    expect(await principalFromToken(noahSession.token)).toBeNull();
    await s.inv.changeMemberRole(nina, noah.id, 'client_member');
  });

  it('AT-19: a verified Azentio identity not on the allow-list gets no membership and an access request', async () => {
    const { ensureEmployeeMembership } = await import('@/lib/auth/employees');
    const approved = await D.withSystemTx(async (tx) => {
      const [user] = await tx.insert(D.schema.users).values({ email: 'new.hire@azentio.com', name: 'New Hire', entraOid: 'oid-new' }).returning();
      return ensureEmployeeMembership(tx, user, 'microsoft');
    });
    expect(approved).toBe(false); // @azentio.com suffix alone grants nothing
    const p = await loginAs('new.hire@azentio.com');
    expect(p.memberships).toHaveLength(0);
    await expectHttp(s.content.getContentById(p, (await s.content.listContent(await loginAs(U.employee), 'experiment'))[0].id), 403);
    const reqs = await D.withSystemTx((tx) => tx.select().from(D.schema.accessRequests).where(eq(D.schema.accessRequests.userId, p.userId)));
    expect(reqs).toHaveLength(1);
  });
});

describe('collective learning lifecycle', () => {
  let obsId: string;

  it('AT-07: saving creates a private draft visible only to its author', async () => {
    const noah = await loginAs(U.northwindMember, 'northwind');
    const created = await s.obs.createDraft(noah, draft);
    obsId = created.id;
    expect(created.state).toBe('draft');
    expect(created.visibilityIntent).toBe('private');
    const nina = await loginAs(U.northwindAdmin, 'northwind');
    expect((await s.obs.listObservations(nina, 'org')).find((o) => o.id === obsId)).toBeUndefined();
    await expectHttp(s.obs.getObservation(nina, obsId), 404);
  });

  it('OBS-02: server validation rejects invalid input', async () => {
    const noah = await loginAs(U.northwindMember, 'northwind');
    await expect(s.obs.createDraft(noah, { ...draft, title: 'short' })).rejects.toThrow();
    await expect(s.obs.submitObservation(noah, obsId, { visibilityIntent: 'propose_shared', consents: { ...consents, publishShared: false } })).rejects.toThrow();
  });

  it('AT-08: moderator queue never lists drafts (app filter and RLS)', async () => {
    const maya = await loginAs(U.moderator);
    const queue = await s.mod.listQueue(maya);
    expect(queue.find((q) => q.id === obsId)).toBeUndefined();
    expect(queue.every((q) => ['submitted', 'in_review', 'under_report'].includes(q.state))).toBe(true);
    const rlsDrafts = await D.withModeratorTx(maya.userId, (tx) => tx.select().from(D.schema.observations).where(eq(D.schema.observations.state, 'draft')));
    expect(rlsDrafts).toHaveLength(0);
    await expectHttp(s.mod.getReviewItem(maya, obsId), 404);
  });

  it('submit → moderate → publish; shared payload has no private fields (AT-09)', async () => {
    const noah = await loginAs(U.northwindMember, 'northwind');
    await s.obs.submitObservation(noah, obsId, { visibilityIntent: 'propose_shared', consents });
    const maya = await loginAs(U.moderator);
    const item = await s.mod.getReviewItem(maya, obsId);
    expect(item.original.state).toBe('in_review');
    expect(item.attributionOrg).toBeNull(); // no attribution consent → moderator doesn't learn the org
    await expectHttp(s.mod.decide(await loginAs(U.employee), obsId, { decision: 'return', authorReason: 'Please clarify the period.' }), 403);
    const res = await s.mod.decide(maya, obsId, {
      decision: 'approve', authorReason: 'Thanks — generalised to region.', internalNote: 'SECRET-REVIEWER-NOTE',
      shared: { title: 'A synthetic seasonal observation', body: draft.body, regionGeneralised: 'Europe', periodQuarter: '2026 Q1', topic: 'Seasonality', showAttribution: false, themeId: null },
    });
    const harbor = await loginAs(U.harborMember, 'harbor');
    const dto = await s.ins.getSharedInsight(harbor, res.sharedInsightId!);
    const json = JSON.stringify(dto);
    expect(json).not.toContain(noah.userId);
    expect(json).not.toContain(noah.activeTenantId!);
    expect(json).not.toContain('SECRET-REVIEWER-NOTE');
    const feed = await s.ins.communityFeed(harbor, {});
    expect(JSON.stringify(feed)).not.toContain(noah.activeTenantId!);
    // Author sees the reason but not the internal note.
    const own = await s.obs.getObservation(noah, obsId);
    expect(JSON.stringify(own)).not.toContain('SECRET-REVIEWER-NOTE');
    expect(own.reviews[0].reason).toContain('generalised');
  });

  it('AT-10: a material edit to a published item creates a new version in review; old shared copy unchanged', async () => {
    const noah = await loginAs(U.northwindMember, 'northwind');
    const edited = await s.obs.updateObservation(noah, obsId, { ...draft, title: 'A synthetic seasonal observation (edited)' });
    expect(edited.state).toBe('submitted');
    expect(edited.version).toBe(2);
    const own = await s.obs.getObservation(noah, obsId);
    expect(own.sharedCopy).toMatchObject({ status: 'published', version: 1, title: 'A synthetic seasonal observation' });
  });

  it('AT-11: withdrawal removes from feed, search, AIRA and counts synchronously', async () => {
    const noah = await loginAs(U.northwindMember, 'northwind');
    const harbor = await loginAs(U.harborMember, 'harbor');
    const before = await s.search.search(harbor, 'synthetic seasonal observation');
    expect(before.results.some((r) => r.title.startsWith('A synthetic seasonal'))).toBe(true);
    const receipt = await s.obs.withdrawObservation(noah, obsId);
    expect(receipt.totalMs).toBeLessThan(60_000);
    const feed = await s.ins.communityFeed(harbor, {});
    expect(feed.results.find((r) => r.id === receipt.sharedInsightId)).toBeUndefined();
    const after = await s.search.search(harbor, 'synthetic seasonal observation');
    expect(after.results.find((r) => r.sourceId === receipt.sharedInsightId)).toBeUndefined();
    const retrieval = await s.search.retrieveForAira(harbor, 'synthetic seasonal observation');
    expect(retrieval.find((r) => r.sourceId === receipt.sharedInsightId)).toBeUndefined();
    await expectHttp(s.ins.getSharedInsight(harbor, receipt.sharedInsightId!), 404);
    const blocked = await D.withSystemTx((tx) => tx.select().from(D.schema.retrievalBlocklist).where(eq(D.schema.retrievalBlocklist.sourceId, receipt.sharedInsightId!)));
    expect(blocked).toHaveLength(1);
  });

  it('report → unpublish → restore keeps index in sync; reporter not disclosed', async () => {
    const harbor = await loginAs(U.harborMember, 'harbor');
    const feed = await s.ins.communityFeed(harbor, {});
    const target = feed.results[0];
    const { reportId } = await s.mod.reportSharedInsight(harbor, target.id, { reason: 'misleading' });
    const maya = await loginAs(U.moderator);
    await s.mod.decideReport(maya, reportId, { decision: 'unpublish', note: 'Checking with contributor.' });
    expect((await s.ins.communityFeed(harbor, {})).results.find((r) => r.id === target.id)).toBeUndefined();
    await s.mod.decideReport(maya, reportId, { decision: 'restore', note: 'Reviewed, accurate.' });
    expect((await s.ins.communityFeed(harbor, {})).results.find((r) => r.id === target.id)).toBeDefined();
  });
});

describe('insights, themes and ideas', () => {
  it('AT-12: a theme with 2 distinct orgs (3 posts) is Emerging with no counts; approving a 3rd org crosses k', async () => {
    const nina = await loginAs(U.northwindAdmin, 'northwind');
    const before = (await s.ins.themeDashboard(nina)).themes.find((t) => t.name === 'Seasonality context')!;
    expect(before).toMatchObject({ emerging: true, orgBand: null, evidence: [], period: null });

    const maya = await loginAs(U.moderator);
    const queue = await s.mod.listQueue(maya);
    const meridian = queue.find((q) => q.title.startsWith('Ramadan'))!;
    const item = await s.mod.getReviewItem(maya, meridian.id);
    expect(item.original.flags.some((f) => f.kind === 'customer_name')).toBe(true);
    expect(item.suggestion.body).toContain('[a customer]');
    expect(item.suggestion.regionGeneralised).toBe('Middle East');
    await s.mod.decide(maya, meridian.id, {
      decision: 'approve', authorReason: 'Published with customer name removed.',
      shared: { title: 'Festival-season retail swings distort quarterly comparisons', body: item.suggestion.body, regionGeneralised: item.suggestion.regionGeneralised, periodQuarter: item.suggestion.periodQuarter, topic: 'Seasonality', showAttribution: false, themeId: item.suggestion.themeId },
    });
    const after = (await s.ins.themeDashboard(nina)).themes.find((t) => t.name === 'Seasonality context')!;
    expect(after.emerging).toBe(false);
    expect(after.orgBand).toBe('3–5'); // 4 posts from 3 orgs → counted as 3
    expect(after.smallSample).toBe(true);
  });

  it('AT-13 + AT-15: disallowed filters are disabled and dropped server-side; count equals visible results', async () => {
    const hb = await loginAs(U.harborMember, 'harbor');
    const feed = await s.ins.communityFeed(hb, { topic: 'Customer onboarding' });
    expect(feed.rejected).toContain('topic');
    expect(feed.count).toBe(feed.results.length);
    const topic = feed.facets.find((f) => f.key === 'topic')!;
    expect(topic.options.find((o) => o.value === 'Customer onboarding')!.disabled).toBe(true);
    const sr = await s.search.search(hb, 'seasonal');
    expect(sr.count).toBe(sr.results.length);
  });

  it('INS-04/05/06 + AT-16: product owner idea with permitted evidence; status change audited and contributors notified', async () => {
    const omar = await loginAs(U.owner);
    await expectHttp(s.ideas.createIdea(await loginAs(U.employee), { title: 'x'.repeat(10), problem: 'y'.repeat(25), offeringId: null, proposedOutcome: 'z'.repeat(12), ownerTeam: 'Team', priority: 'low', evidenceIds: [] }), 403);
    const evidence = (await s.ideas.listLinkableEvidence(omar)).filter((e) => e.topic === 'Seasonality');
    const { id } = await s.ideas.createIdea(omar, {
      title: 'Seasonality-aware comparison explanation', problem: 'Seasonal SMEs are compared against naive annualised baselines.', offeringId: evidence[0].offeringId,
      proposedOutcome: 'Explain comparisons against a seasonal baseline.', ownerTeam: 'FAI squad', priority: 'high', evidenceIds: evidence.map((e) => e.id),
    });
    await expectHttp(s.ideas.createIdea(omar, { title: 'Raw evidence link', problem: 'Trying to link a private record id.', offeringId: null, proposedOutcome: 'Should fail entirely.', ownerTeam: 'Team', priority: 'low', evidenceIds: ['not-a-shared-insight'] }), 400);
    const res = await s.ideas.updateIdeaStatus(omar, id, { status: 'under_review', publicUpdate: 'Under review with the product team. Not a delivery commitment.', internalNotes: 'INTERNAL-ROADMAP-Q3' });
    expect(res.notified).toBeGreaterThanOrEqual(3);
    const audits = await D.withSystemTx((tx) => tx.select().from(D.schema.auditEvents).where(and(eq(D.schema.auditEvents.resourceId, id), eq(D.schema.auditEvents.action, 'idea.status_change'))));
    expect(audits).toHaveLength(1);
    const hugo = await loginAs(U.harborMember, 'harbor');
    const notes = await s.notif.listNotifications(hugo);
    const n = notes.find((x) => x.type === 'idea_status')!;
    expect(n.body).toContain('Under review');
    expect(JSON.stringify(notes)).not.toContain('INTERNAL-ROADMAP');
    const publicIdeas = await s.ideas.listPublicIdeas(hugo);
    expect(JSON.stringify(publicIdeas)).not.toContain('INTERNAL-ROADMAP');
    expect(publicIdeas.find((i) => i.id === id)?.statusLabel).toBe('Under review');
  });

  it('AT-14: a client asking AIRA about an employee-only experiment gets no answer, no citation, no hint', async () => {
    const hb = await loginAs(U.harborMember, 'harbor');
    const r = await collect(s.aira.answer(hb, 'Project Lighthouse'));
    expect(r.text).toBe(s.aira.NO_ANSWER);
    expect(r.citations).toHaveLength(0);
    // A broader question may be answered from public/shared sources, but never from the employee partition.
    const broad = await collect(s.aira.answer(hb, 'Project Lighthouse agentic spreading prototype'));
    expect(broad.text).not.toMatch(/Lighthouse|internal|prompt templates/i);
    expect(JSON.stringify(broad.citations)).not.toMatch(/employee_content|\/hub\//);
    const emp = await loginAs(U.employee);
    const e = await collect(s.aira.answer(emp, 'Project Lighthouse agentic spreading prototype'));
    expect(e.citations.length).toBeGreaterThan(0);
    const anon = await s.search.search(null, 'Lighthouse');
    expect(anon.count).toBe(0);
  });

  it('PUB-06: public search returns only public content', async () => {
    const r = await s.search.search(null, 'seasonality');
    expect(r.results.every((x) => x.audience === 'public')).toBe(true);
  });

  it('AT-17: without an email provider, outbox email stays "queued" — never "delivered"', async () => {
    const { processEmailOutbox } = await import('@/lib/outbox');
    delete process.env.RESEND_API_KEY;
    expect((await processEmailOutbox()).provider).toBe(false);
    const emails = await D.withSystemTx((tx) => tx.select().from(D.schema.outbox).where(eq(D.schema.outbox.channel, 'email')));
    expect(emails.length).toBeGreaterThan(0);
    expect(emails.every((e) => e.status === 'queued')).toBe(true);
  });
});
