import { beforeAll, describe, expect, it } from 'vitest';
import { inArray, ne, or } from 'drizzle-orm';
import { db, expectHttp, loginAs } from '../helpers';
import { DEMO_USERS as U } from '@/scripts/seed-data';
import { FORBIDDEN_SHARED_KEYS } from '@/lib/learning/dto';

type A = typeof import('@/lib/insights/assist');
let a: A;
let D: Awaited<ReturnType<typeof db>>;
let hidden: { id: string; title: string }[]; // drafts, private, org-only observations
let orgIds: string[];
let orgNames: string[];
let docsDupId: string;
let docsDup2Id: string;
let meridianId: string;

const consents = { storeProcess: true, publishShared: true, attribution: false, trainingProgramme: false };
const docsDraft = {
  type: 'operational_challenge', confidence: 'medium', topic: 'Document handling', industry: 'Credit unions', region: 'Toronto', periodStart: '2026-07-01', periodEnd: '2026-09-30',
  title: 'Multi-document loan packs stall at upload stage',
  body: 'Applicants abandon or resend loan packs when one document fails validation, and our analysts lose track of which version of the pack is current.',
};

function collectKeys(v: unknown, out = new Set<string>()) {
  if (Array.isArray(v)) v.forEach((x) => collectKeys(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (out.add(k), collectKeys(x, out));
  return out;
}

function assertSafe(payload: unknown) {
  const keys = collectKeys(payload);
  for (const k of FORBIDDEN_SHARED_KEYS) expect(keys.has(k), `forbidden key ${k}`).toBe(false);
  const text = JSON.stringify(payload);
  for (const id of orgIds) expect(text).not.toContain(id);
  for (const n of orgNames) expect(text).not.toContain(n);
  for (const h of hidden) {
    expect(text).not.toContain(h.id);
    expect(text).not.toContain(h.title);
  }
  expect(text).not.toMatch(/Brightwater|44120987|weekly spreading QA/);
}

beforeAll(async () => {
  D = await db();
  a = await import('@/lib/insights/assist');
  const obs = await import('@/lib/services/observations');
  const hugo = await loginAs(U.harborMember, 'harbor');
  docsDupId = (await obs.createDraft(hugo, docsDraft)).id;
  await obs.submitObservation(hugo, docsDupId, { visibilityIntent: 'propose_shared', consents });
  docsDup2Id = (await obs.createDraft(hugo, { ...docsDraft, title: 'Loan packs with many documents stall at upload' })).id;
  await obs.submitObservation(hugo, docsDup2Id, { visibilityIntent: 'propose_shared', consents });
  // A fresh private draft lexically close to the seasonality items: must never surface.
  const noah = await loginAs(U.northwindMember, 'northwind');
  await obs.createDraft(noah, { type: 'market_observation', confidence: 'medium', topic: 'Seasonality', industry: 'SME lending', region: 'Leeds', periodStart: '2026-07-01', periodEnd: '2026-09-30', title: 'Draft: seasonal SMEs flagged as distressed again', body: 'Private draft: seasonal SMEs flagged as distressed after off-season annualisation; quarterly comparisons overstate risk.' });

  const S = D.schema;
  hidden = await D.withSystemTx((tx) => tx.select({ id: S.observations.id, title: S.observations.title }).from(S.observations).where(or(ne(S.observations.visibilityIntent, 'propose_shared'), inArray(S.observations.state, ['draft']))));
  const orgs = await D.withSystemTx((tx) => tx.select().from(S.organisations));
  orgIds = orgs.map((o) => o.id);
  orgNames = orgs.filter((o) => o.type === 'client').map((o) => o.name);
  const [m] = await D.withSystemTx((tx) => tx.select({ id: S.observations.id, title: S.observations.title }).from(S.observations).where(inArray(S.observations.title, ['Ramadan-season retail swings distort quarterly comparisons'])));
  meridianId = m.id;
  expect(hidden.some((h) => h.title.startsWith('Draft: Brightwater Bakery'))).toBe(true);
  expect(hidden.some((h) => h.title.startsWith('Internal: weekly spreading'))).toBe(true);
});

describe('duplicate detection (moderators)', () => {
  it('finds the three published "Multi-document loan packs" copies as likely duplicates from other orgs', async () => {
    const maya = await loginAs(U.moderator);
    const r = await a.findPossibleDuplicates(maya, docsDupId);
    const shared = r.matches.filter((m) => m.kind === 'shared_insight' && m.title === 'Multi-document loan packs stall at upload');
    expect(shared).toHaveLength(3);
    for (const m of shared) {
      expect(m.strength).toBe('likely_duplicate');
      expect(m.sameOrganisation).toBe(false);
      expect(m.theme?.name).toBe('Document upload friction');
      expect(m.matchedTerms.length).toBeGreaterThan(0);
    }
    expect(r.method).toMatch(/not semantic embeddings/);
    assertSafe(r);
  });

  it('flags a repeated post from the same organisation (boolean only)', async () => {
    const maya = await loginAs(U.moderator);
    const r = await a.findPossibleDuplicates(maya, docsDup2Id);
    const q = r.matches.find((m) => m.kind === 'queue_item' && m.id === docsDupId);
    expect(q?.sameOrganisation).toBe(true);
    assertSafe(r);
  });

  it('matches the submitted Meridian seasonality item to published seasonality items, never to drafts/private/org-only', async () => {
    const maya = await loginAs(U.moderator);
    const r = await a.findPossibleDuplicates(maya, meridianId, 20);
    expect(r.matches.some((m) => m.kind === 'shared_insight' && /seasonal/i.test(m.title))).toBe(true);
    assertSafe(r);
    const overview = await a.queueDuplicateOverview(maya);
    expect(overview.items.map((i) => i.id)).toEqual(expect.arrayContaining([meridianId, docsDupId]));
    assertSafe(overview);
  });

  it('cannot be pointed at a draft, private or org-only observation (404 under moderator RLS)', async () => {
    const maya = await loginAs(U.moderator);
    for (const h of hidden) await expectHttp(a.findPossibleDuplicates(maya, h.id), 404);
  });

  it('non-moderators get 403 (employee, product owner, client admin) and anonymous 401', async () => {
    for (const p of [await loginAs(U.employee), await loginAs(U.owner), await loginAs(U.northwindAdmin, 'northwind')]) {
      await expectHttp(a.findPossibleDuplicates(p, meridianId), 403);
      await expectHttp(a.suggestClusters(p), 403);
      await expectHttp(a.queueDuplicateOverview(p), 403);
    }
    await expectHttp(a.suggestClusters(null), 401);
  });
});

describe('cluster suggestions (moderators)', () => {
  it('clusters the published duplicates with banded org breadth and existing theme link', async () => {
    const maya = await loginAs(U.moderator);
    const r = await a.suggestClusters(maya);
    const docs = r.clusters.find((c) => c.members.some((m) => m.title === 'Multi-document loan packs stall at upload'))!;
    expect(docs.members).toHaveLength(3);
    expect(docs.orgBand).toBe(`${r.k}–5`);
    expect(docs.status).toBe('existing_theme');
    expect(docs.themes[0].name).toBe('Document upload friction');
    expect(docs.uncertainty).toMatch(/lexical/);
    const reg = r.clusters.find((c) => c.members.some((m) => m.title === 'Validation rules lag behind rule updates'));
    expect(reg?.orgBand).toBeNull(); // 2 orgs < k
    for (const c of r.clusters) if (c.status === 'emerging') expect(c.orgBand).toBeNull();
    // Only published shared copies are clustered — queue items and drafts never appear.
    expect(JSON.stringify(r)).not.toContain(docsDupId);
    assertSafe(r);
  });
});

describe('trend-change summaries', () => {
  it('suppress direction and evidence below k; carry caveats; readable by community members', async () => {
    const noah = await loginAs(U.northwindMember, 'northwind');
    const r = await a.themeTrendChanges(noah);
    const by = (n: string) => r.trends.find((t) => t.name === n)!;
    for (const n of ['Regulatory change cadence', 'Onboarding drop-off', 'Seasonality context']) {
      expect(by(n).direction).toBe('insufficient');
      expect(by(n).text).toMatch(/Insufficient evidence to describe a trend/);
      expect(by(n).evidence).toEqual([]);
      expect(by(n).orgBand).toBeNull();
      expect(by(n).latestPeriod).toBeNull();
    }
    const docs = by('Document upload friction');
    expect(docs.direction).not.toBe('insufficient');
    expect(docs.evidence.length).toBe(3);
    expect(r.caveat).toMatch(/not prevalence/i);
    expect(r.caveat).toMatch(/cause/);
    assertSafe(r);
    await expectHttp(a.themeTrendChanges(null), 401);
  });
});

describe('assisted prioritisation (product owners)', () => {
  it('denied to plain employees, moderators and clients', async () => {
    for (const p of [await loginAs(U.employee), await loginAs(U.moderator), await loginAs(U.northwindAdmin, 'northwind'), await loginAs(U.harborMember, 'harbor')]) {
      await expectHttp(a.prioritisationAssist(p), 403);
    }
    await expectHttp(a.prioritisationAssist(null), 401);
  });

  it('ranks only ≥ k themes with a factor breakdown; emerging themes have no score', async () => {
    const omar = await loginAs(U.owner);
    const r = await a.prioritisationAssist(omar);
    expect(r.note).toMatch(/Assistive ranking — not a decision; popularity is not prevalence; a human owner sets priority/);
    expect(r.ranked.map((t) => t.name)).toEqual(['Document upload friction']);
    const t = r.ranked[0];
    expect(t.score).toBe(Math.round(t.factors.reduce((s, f) => s + f.points, 0)));
    expect(t.ideas.length).toBe(1);
    expect(t.factors.find((f) => f.key === 'unaddressed')!.points).toBe(0);
    expect(r.emerging.map((e) => e.name).sort()).toEqual(['Onboarding drop-off', 'Regulatory change cadence', 'Seasonality context']);
    for (const e of r.emerging) {
      expect(e).not.toHaveProperty('score');
      expect(e).not.toHaveProperty('evidence');
      expect(e).not.toHaveProperty('orgBand');
    }
    assertSafe(r);
  });

  it('feedback is read as aggregate counts and shifts only the documented factor', async () => {
    const S = D.schema;
    const omar = await loginAs(U.owner);
    const before = (await a.prioritisationAssist(omar)).ranked[0];
    const docIds = before.evidence.map((e) => e.id);
    const users = await D.withSystemTx((tx) => tx.select({ id: S.users.id }).from(S.users).limit(30));
    await D.withSystemTx((tx) => tx.insert(S.contributionFeedback).values(docIds.flatMap((sharedInsightId) => users.map((u) => ({ sharedInsightId, userId: u.id, rating: 'needs_evidence' as const })))).onConflictDoNothing());
    const after = (await a.prioritisationAssist(omar)).ranked[0];
    const suff = (t: typeof before) => t.factors.find((f) => f.key === 'evidenceSufficiency')!;
    expect(suff(after).value).toBeLessThan(suff(before).value);
    expect(suff(after).note).toMatch(/% of ratings asked for more evidence/);
    expect(after.score).toBeLessThan(before.score);
    assertSafe(after);
  });
});
