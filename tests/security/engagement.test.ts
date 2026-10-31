import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, like } from 'drizzle-orm';
import { db, expectHttp, loginAs } from '../helpers';
import { DEMO_USERS as U } from '@/scripts/seed-data';

type Svc = {
  eng: typeof import('@/lib/services/engagement');
  com: typeof import('@/lib/services/comments');
  dig: typeof import('@/lib/services/digests');
  mod: typeof import('@/lib/services/moderation');
  obs: typeof import('@/lib/services/observations');
  ins: typeof import('@/lib/insights');
  dto: typeof import('@/lib/learning/dto');
};
let s: Svc;
let D: Awaited<ReturnType<typeof db>>;

const draft = {
  type: 'market_observation', confidence: 'medium', topic: 'Data quality', industry: 'Banking', region: 'Europe',
  periodStart: '2026-01-01', periodEnd: '2026-03-31', title: 'Engagement test observation for comments', body: 'Synthetic body text describing a data quality observation in enough detail to pass validation rules.',
};
const consents = { storeProcess: true, publishShared: true, attribution: false, trainingProgramme: false };

const sharedByTitle = async (title: string) => {
  const [row] = await D.withSystemTx((tx) => tx.select().from(D.schema.sharedInsights).where(eq(D.schema.sharedInsights.title, title)));
  return row;
};
const forbiddenKeysIn = (value: unknown) => {
  const found: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if ((s.dto.FORBIDDEN_SHARED_KEYS as readonly string[]).includes(k)) found.push(k); walk(x); }
  };
  walk(value);
  return found;
};

beforeAll(async () => {
  D = await db();
  s = {
    eng: await import('@/lib/services/engagement'),
    com: await import('@/lib/services/comments'),
    dig: await import('@/lib/services/digests'),
    mod: await import('@/lib/services/moderation'),
    obs: await import('@/lib/services/observations'),
    ins: await import('@/lib/insights'),
    dto: await import('@/lib/learning/dto'),
  };
});

describe('quality feedback (§10)', () => {
  it('requires community access: anonymous 401, no client/employee membership 403', async () => {
    const docs = await sharedByTitle('Multi-document loan packs stall at upload');
    await expectHttp(s.eng.setFeedback(null, docs.id, { rating: 'useful' }), 401);
    await expectHttp(s.eng.setFeedback(await loginAs(U.pending), docs.id, { rating: 'useful' }), 403);
    await expectHttp(s.eng.setFeedback(await loginAs(U.consultant), docs.id, { rating: 'useful' }), 403); // no active tenant
    await expectHttp(s.eng.engagementFor(null, [docs.id]), 401);
  });

  it('one vote per user per item: a new rating replaces the old one; DELETE clears it', async () => {
    const docs = await sharedByTitle('Multi-document loan packs stall at upload');
    const meridian = await loginAs(U.meridianMember, 'meridian');
    const base = (await s.eng.engagementFor(meridian, [docs.id]))[docs.id];
    const a = await s.eng.setFeedback(meridian, docs.id, { rating: 'useful' });
    expect(a).toMatchObject({ useful: base.useful + 1, needsEvidence: base.needsEvidence, mine: 'useful' });
    const b = await s.eng.setFeedback(meridian, docs.id, { rating: 'needs_evidence' });
    expect(b).toMatchObject({ useful: base.useful, needsEvidence: base.needsEvidence + 1, mine: 'needs_evidence' });
    const again = await s.eng.setFeedback(meridian, docs.id, { rating: 'needs_evidence' });
    expect(again.needsEvidence).toBe(base.needsEvidence + 1);
    const rows = await D.withSystemTx((tx) => tx.select().from(D.schema.contributionFeedback).where(and(eq(D.schema.contributionFeedback.sharedInsightId, docs.id), eq(D.schema.contributionFeedback.userId, meridian.userId))));
    expect(rows).toHaveLength(1);
    const c = await s.eng.clearFeedback(meridian, docs.id);
    expect(c).toMatchObject({ useful: base.useful, needsEvidence: base.needsEvidence, mine: null });
    await expect(s.eng.setFeedback(meridian, docs.id, { rating: 'great' })).rejects.toThrow();
  });

  it('feedback on an unpublished item is refused', async () => {
    const harbor = await loginAs(U.harborMember, 'harbor');
    await expectHttp(s.eng.setFeedback(harbor, 'does-not-exist', { rating: 'useful' }), 404);
  });
});

describe('collaborative comments', () => {
  let parentId: string;
  let obsId: string;

  it('comment payloads carry a role label only — no author id, tenant, email or forbidden keys', async () => {
    const docs = await sharedByTitle('Multi-document loan packs stall at upload');
    const harbor = await loginAs(U.harborMember, 'harbor');
    const { comment, held } = await s.com.createComment(harbor, docs.id, { body: 'We see this as well when a single scan is rejected.' });
    expect(held).toBe(false);
    expect(comment.authorLabel).toBe('You · Client participant');
    const noah = await loginAs(U.northwindMember, 'northwind');
    const list = await s.com.listComments(noah, docs.id);
    const mine = list.find((c) => c.id === comment.id)!;
    expect(mine).toMatchObject({ authorLabel: 'Client participant', isMine: false, status: null });
    const json = JSON.stringify(list);
    for (const leak of [harbor.userId, harbor.activeTenantId!, harbor.email, 'Harbor Credit Union', 'Hugo']) expect(json).not.toContain(leak);
    expect(forbiddenKeysIn(list)).toEqual([]);
    expect(Object.keys(mine).sort()).toEqual(['authorLabel', 'body', 'createdAt', 'id', 'isMine', 'status']);
    // The seeded employee comment is labelled as such
    const season = await sharedByTitle('Seasonal SMEs flagged as distressed after off-season annualisation');
    expect((await s.com.listComments(noah, season.id)).some((c) => c.authorLabel === 'Azentio employee')).toBe(true);
  });

  it('validates length and access server-side', async () => {
    const docs = await sharedByTitle('Multi-document loan packs stall at upload');
    const harbor = await loginAs(U.harborMember, 'harbor');
    await expect(s.com.createComment(harbor, docs.id, { body: 'x' })).rejects.toThrow();
    await expect(s.com.createComment(harbor, docs.id, { body: 'y'.repeat(1001) })).rejects.toThrow();
    await expectHttp(s.com.createComment(null, docs.id, { body: 'hello there' }), 401);
    await expectHttp(s.com.listComments(await loginAs(U.pending), docs.id), 403);
  });

  it('a comment with sensitive content is held: visible to its author as awaiting moderation, not to others', async () => {
    const docs = await sharedByTitle('Multi-document loan packs stall at upload');
    const noah = await loginAs(U.northwindMember, 'northwind');
    const { comment, held } = await s.com.createComment(noah, docs.id, { body: 'Brightwater Bakery account 44120987 had this exact problem.' });
    expect(held).toBe(true);
    expect((await s.com.listComments(noah, docs.id)).find((c) => c.id === comment.id)?.status).toBe('Awaiting moderation');
    const harbor = await loginAs(U.harborMember, 'harbor');
    const others = await s.com.listComments(harbor, docs.id);
    expect(others.find((c) => c.id === comment.id)).toBeUndefined();
    expect(JSON.stringify(others)).not.toContain('Brightwater');
    const maya = await loginAs(U.moderator);
    const q = await s.com.commentModerationQueue(maya);
    expect(q.held.some((h) => h.id === comment.id && h.flagKinds.includes('customer_name'))).toBe(true);
    expect(JSON.stringify(q)).not.toContain(noah.userId);
    await expectHttp(s.com.commentModerationQueue(harbor), 403);
    await s.com.decideComment(maya, comment.id, { action: 'remove', note: 'Removed because it named a client and an account number.' });
    expect((await s.com.listComments(harbor, docs.id)).find((c) => c.id === comment.id)).toMatchObject({ body: null, status: 'Removed by moderators' });
    const notes = await D.withSystemTx((tx) => tx.select().from(D.schema.notifications).where(and(eq(D.schema.notifications.userId, noah.userId), eq(D.schema.notifications.type, 'comment_moderation'))));
    expect(notes.some((n) => n.body.includes('named a client'))).toBe(true);
  });

  it('report → moderator hide → body no longer readable by anyone in the community', async () => {
    const docs = await sharedByTitle('Multi-document loan packs stall at upload');
    const meridian = await loginAs(U.meridianMember, 'meridian');
    const { comment } = await s.com.createComment(meridian, docs.id, { body: 'This is a rude and unhelpful remark.' });
    const harbor = await loginAs(U.harborMember, 'harbor');
    await expectHttp(s.com.reportComment(null, comment.id, { reason: 'inappropriate' }), 401);
    const { reportId } = await s.com.reportComment(harbor, comment.id, { reason: 'inappropriate' });
    const maya = await loginAs(U.moderator);
    expect((await s.com.commentModerationQueue(maya)).reports.some((r) => r.id === reportId)).toBe(true);
    await expectHttp(s.com.decideComment(harbor, comment.id, { action: 'hide', note: 'trying to hide' }), 403);
    await s.com.decideComment(maya, comment.id, { action: 'hide', note: 'Hidden: not constructive.' });
    for (const viewer of [harbor, meridian, await loginAs(U.employee)]) {
      const c = (await s.com.listComments(viewer, docs.id)).find((x) => x.id === comment.id);
      expect(c?.body ?? null).toBeNull();
    }
    expect((await s.com.commentModerationQueue(maya)).reports.some((r) => r.id === reportId)).toBe(false);
    const [rep] = await D.withSystemTx((tx) => tx.select().from(D.schema.commentReports).where(eq(D.schema.commentReports.id, reportId)));
    expect(rep.status).toBe('resolved');
    await expectHttp(s.com.reportComment(harbor, comment.id, { reason: 'other' }), 404); // hidden comments can't be re-reported
  });

  it('withdrawn parent → its comments vanish from every read', async () => {
    const noah = await loginAs(U.northwindMember, 'northwind');
    const created = await s.obs.createDraft(noah, draft);
    obsId = created.id;
    await s.obs.submitObservation(noah, obsId, { visibilityIntent: 'propose_shared', consents });
    const maya = await loginAs(U.moderator);
    const res = await s.mod.decide(maya, obsId, {
      decision: 'approve', authorReason: 'Approved, generalised.', internalNote: 'SECRET-NOTE', evidenceQuality: 'limited',
      shared: { title: 'Engagement test observation for comments', body: draft.body, regionGeneralised: 'Europe', periodQuarter: '2026 Q1', topic: 'Data quality', showAttribution: false, themeId: null },
    });
    parentId = res.sharedInsightId!;
    const harbor = await loginAs(U.harborMember, 'harbor');
    await s.com.createComment(harbor, parentId, { body: 'Helpful, thank you for sharing this.' });
    expect(await s.com.listComments(harbor, parentId)).toHaveLength(1);
    expect((await s.com.commentCounts(harbor, [parentId]))[parentId]).toBe(1);
    await s.obs.withdrawObservation(noah, obsId);
    await expectHttp(s.com.listComments(harbor, parentId), 404);
    await expectHttp(s.com.createComment(harbor, parentId, { body: 'Still there?' }), 404);
    expect((await s.com.commentCounts(harbor, [parentId]))[parentId]).toBeUndefined();
    expect(await s.eng.engagementFor(harbor, [parentId])).toEqual({});
  });
});

describe('bookmarks and saved searches are private to their owner', () => {
  it('user A’s bookmarks and saved searches are invisible to user B (service and raw RLS)', async () => {
    const noah = await loginAs(U.northwindMember, 'northwind');
    const hugo = await loginAs(U.harborMember, 'harbor');
    const noahMarks = await s.eng.listBookmarks(noah);
    expect(noahMarks.length).toBeGreaterThan(0); // seeded
    const noahSearches = await s.eng.listSavedSearches(noah);
    expect(noahSearches.length).toBeGreaterThan(0);
    const hugoMarks = await s.eng.listBookmarks(hugo);
    expect(hugoMarks.some((b) => noahMarks.some((n) => n.id === b.id))).toBe(false);
    expect(await s.eng.listSavedSearches(hugo)).toEqual([]);
    await expectHttp(s.eng.runSavedSearch(hugo, noahSearches[0].id), 404);
    await expectHttp(s.eng.deleteSavedSearch(hugo, noahSearches[0].id), 404);
    // Raw RLS: Hugo's context sees zero of Noah's rows even with no app-level filter.
    for (const table of [D.schema.bookmarks, D.schema.savedSearches, D.schema.themeSubscriptions, D.schema.contributionFeedback]) {
      const rows = await D.withTenantTx(hugo.userId, hugo.activeTenantId, (tx) => tx.select().from(table).where(eq(table.userId, noah.userId)));
      expect(rows).toHaveLength(0);
    }
    // ...and cannot write rows for another user.
    await expect(D.withTenantTx(hugo.userId, hugo.activeTenantId, (tx) => tx.insert(D.schema.bookmarks).values({ userId: noah.userId, tenantId: hugo.activeTenantId, sourceType: 'shared_insight', sourceId: 'x' }))).rejects.toThrow();
  });

  it('bookmarks re-check visibility: a withdrawn item shows as “No longer available” without its title', async () => {
    const noah = await loginAs(U.northwindMember, 'northwind');
    const created = await s.obs.createDraft(noah, { ...draft, title: 'Bookmark visibility test observation' });
    await s.obs.submitObservation(noah, created.id, { visibilityIntent: 'propose_shared', consents });
    const maya = await loginAs(U.moderator);
    const res = await s.mod.decide(maya, created.id, {
      decision: 'approve', authorReason: 'Approved, generalised.',
      shared: { title: 'Bookmark visibility test observation', body: draft.body, regionGeneralised: 'Europe', periodQuarter: '2026 Q1', topic: 'Data quality', showAttribution: false, themeId: null },
    });
    const hugo = await loginAs(U.harborMember, 'harbor');
    await s.eng.addBookmark(hugo, { sourceType: 'shared_insight', sourceId: res.sharedInsightId });
    expect((await s.eng.listBookmarks(hugo)).find((b) => b.sourceId === res.sharedInsightId)).toMatchObject({ available: true, title: 'Bookmark visibility test observation' });
    await s.obs.withdrawObservation(noah, created.id);
    const after = (await s.eng.listBookmarks(hugo)).find((b) => b.sourceId === res.sharedInsightId)!;
    expect(after.available).toBe(false);
    expect(JSON.stringify(after)).not.toContain('Bookmark visibility test');
    await expectHttp(s.eng.addBookmark(hugo, { sourceType: 'shared_insight', sourceId: res.sharedInsightId }), 404);
    await expectHttp(s.eng.addBookmark(null, { sourceType: 'shared_insight', sourceId: res.sharedInsightId }), 401);
  });

  it('saved searches store query + filters only and re-apply the current k rules at run time', async () => {
    const hugo = await loginAs(U.harborMember, 'harbor');
    // Seasonality has 2 distinct orgs before Meridian's item is approved → the topic filter is refused.
    const saved = await s.eng.createSavedSearch(hugo, { name: 'Seasonality only', query: '', filters: { topic: 'Seasonality' } });
    const [row] = await D.withSystemTx((tx) => tx.select().from(D.schema.savedSearches).where(eq(D.schema.savedSearches.id, saved.id)));
    expect(Object.keys(row).sort()).toEqual(['createdAt', 'filters', 'id', 'name', 'query', 'tenantId', 'userId']);
    const before = await s.eng.runSavedSearch(hugo, saved.id);
    expect(before.rejected).toContain('topic');
    expect(before.applied.topic).toBeUndefined();
    expect(before.count).toBe(before.results.length);
    expect(forbiddenKeysIn(before)).toEqual([]);
    await expect(s.eng.createSavedSearch(hugo, { name: 'bad', filters: { tenantId: 'x' } })).rejects.toThrow();
    (globalThis as { __savedSeasonality?: string }).__savedSeasonality = saved.id;
  });
});

describe('evidence quality, theme subscriptions and digests', () => {
  it('approval persists reviewer-assessed evidenceQuality in the DTO; forbidden keys stay absent; subscribers get a k-safe notice', async () => {
    const maya = await loginAs(U.moderator);
    const queue = await s.mod.listQueue(maya);
    const meridian = queue.find((q) => q.title.startsWith('Ramadan'))!;
    const item = await s.mod.getReviewItem(maya, meridian.id);
    const res = await s.mod.decide(maya, meridian.id, {
      decision: 'approve', authorReason: 'Published with customer name removed.', internalNote: 'REVIEWER-ONLY', evidenceQuality: 'moderate',
      shared: { title: 'Festival-season retail swings distort quarterly comparisons', body: item.suggestion.body, regionGeneralised: item.suggestion.regionGeneralised, periodQuarter: item.suggestion.periodQuarter, topic: 'Seasonality', showAttribution: false, themeId: item.suggestion.themeId },
    });
    const hugo = await loginAs(U.harborMember, 'harbor');
    const dto = await s.ins.getSharedInsight(hugo, res.sharedInsightId!);
    expect(dto.evidenceQuality).toBe('moderate');
    expect(forbiddenKeysIn(dto)).toEqual([]);
    expect(JSON.stringify(dto)).not.toContain('REVIEWER-ONLY');
    await expect(s.mod.decide(maya, 'x', { decision: 'approve', authorReason: 'ok fine', evidenceQuality: 'excellent', shared: {} })).rejects.toThrow();

    // Noah (seeded subscriber to Seasonality context) is told — with a band now that the theme reached k — never the org.
    const noah = await loginAs(U.northwindMember, 'northwind');
    const [n] = await D.withSystemTx((tx) => tx.select().from(D.schema.notifications).where(and(eq(D.schema.notifications.userId, noah.userId), eq(D.schema.notifications.type, 'theme_update'))));
    expect(n.title).toContain('Seasonality context');
    expect(n.body).toContain('3–5');
    expect(`${n.title} ${n.body}`).not.toMatch(/Meridian|Dubai|Coastal/);
    // The contributor is not notified through the subscription channel.
    const meridianUser = await loginAs(U.meridianMember, 'meridian');
    const own = await D.withSystemTx((tx) => tx.select().from(D.schema.notifications).where(and(eq(D.schema.notifications.userId, meridianUser.userId), eq(D.schema.notifications.type, 'theme_update'))));
    expect(own).toHaveLength(0);
  });

  it('a saved search re-runs under today’s rules: the once-refused filter now applies', async () => {
    const hugo = await loginAs(U.harborMember, 'harbor');
    const id = (globalThis as { __savedSeasonality?: string }).__savedSeasonality!;
    const after = await s.eng.runSavedSearch(hugo, id);
    expect(after.rejected).not.toContain('topic');
    expect(after.applied.topic).toBe('Seasonality');
    expect(after.results.every((r) => r.topic === 'Seasonality')).toBe(true);
  });

  it('subscribe/unsubscribe requires community access and is per user', async () => {
    const hugo = await loginAs(U.harborMember, 'harbor');
    const { themes } = await s.ins.themeDashboard(hugo);
    const docs = themes.find((t) => t.name === 'Document upload friction')!;
    await expectHttp(s.eng.subscribeTheme(null, docs.id), 401);
    await expectHttp(s.eng.subscribeTheme(await loginAs(U.pending), docs.id), 403);
    await s.eng.subscribeTheme(hugo, docs.id);
    await s.eng.subscribeTheme(hugo, docs.id); // idempotent
    expect((await s.eng.listSubscriptions(hugo)).filter((x) => x.themeId === docs.id)).toHaveLength(1);
    await s.eng.unsubscribeTheme(hugo, docs.id);
    expect((await s.eng.listSubscriptions(hugo)).find((x) => x.themeId === docs.id)).toBeUndefined();
    await expectHttp(s.eng.subscribeTheme(hugo, 'no-such-theme'), 404);
  });

  it('digests: no counts for themes below k, bands for established themes, idempotent per week, email only queued', async () => {
    const admin = await loginAs(U.admin);
    await expectHttp(s.dig.runDigests(await loginAs(U.moderator), {}), 403);
    await expectHttp(s.dig.runDigests(null, {}), 401);
    const first = await s.dig.runDigests(admin, { sinceDays: 30 });
    expect(first.notified).toBeGreaterThan(0);
    expect(first.emailStatus).toBe('queued');

    const emp = await loginAs(U.employee); // seeded subscriber to "Regulatory change cadence" (2 orgs < k)
    const [d] = await D.withSystemTx((tx) => tx.select().from(D.schema.notifications).where(and(eq(D.schema.notifications.userId, emp.userId), eq(D.schema.notifications.type, 'digest'))));
    const line = d.body.split('\n').find((l) => l.startsWith('Regulatory change cadence'))!;
    expect(line).toContain('emerging');
    expect(line).not.toMatch(/\d/); // no counts, bands or numbers of any kind
    expect(line).toContain('New activity');

    const noah = await loginAs(U.northwindMember, 'northwind');
    const [nd] = await D.withSystemTx((tx) => tx.select().from(D.schema.notifications).where(and(eq(D.schema.notifications.userId, noah.userId), eq(D.schema.notifications.type, 'digest'))));
    expect(nd.body).toMatch(/Seasonality context: established \(3–5 contributing organisations\)/);
    expect(nd.body).toMatch(/Document upload friction: established/);
    expect(nd.body).not.toMatch(/Northwind|Harbor|Meridian|Cedar|Atlas|Bluewater/);

    const second = await s.dig.buildDigests(new Date(Date.now() - 30 * 86400_000));
    expect(second.notified).toBe(0);
    const digests = await D.withSystemTx((tx) => tx.select().from(D.schema.notifications).where(and(eq(D.schema.notifications.userId, noah.userId), eq(D.schema.notifications.type, 'digest'))));
    expect(digests).toHaveLength(1);
    const emails = await D.withSystemTx((tx) => tx.select().from(D.schema.outbox).where(and(eq(D.schema.outbox.channel, 'email'), like(D.schema.outbox.dedupeKey, 'email:digest:%'))));
    expect(emails.length).toBe(first.emailsQueued);
    expect(emails.every((e) => e.status === 'queued')).toBe(true);
    expect(emails.some((e) => JSON.stringify(e.payload).includes('Regulatory change cadence: emerging, counts withheld'))).toBe(true);
  });
});
