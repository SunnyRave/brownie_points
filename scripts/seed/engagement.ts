import { eq, inArray } from 'drizzle-orm';
import { schema, type Tx } from '@/lib/db';
import { scanSensitive } from '@/lib/scan';
import type { Refs } from './refs';

/** Synthetic seed data for the engagement features. Must only insert (runs once per database). */
export async function seedEngagement(tx: Tx, refs: Refs) {
  const { users: u, orgs, themes, shared } = refs;
  if (!shared.length) return;
  const byTitle = (t: string) => shared.filter((s) => s.title === t);
  const docs = byTitle('Multi-document loan packs stall at upload');
  const season = byTitle('Seasonal SMEs flagged as distressed after off-season annualisation')[0];
  const overrides = byTitle('Analysts manually override seasonal comparisons')[0];
  const harvest = byTitle('Harvest-cycle businesses assessed inconsistently across quarters')[0];
  const onboarding = byTitle('Applicants drop off at income verification')[0];
  const regulatory = byTitle('Validation rules lag behind rule updates');

  // Reviewer-assessed evidence quality (moderator judgement at approval).
  const setQuality = async (ids: string[], q: 'strong' | 'moderate' | 'limited') => {
    if (ids.length) await tx.update(schema.sharedInsights).set({ evidenceQuality: q }).where(inArray(schema.sharedInsights.id, ids));
  };
  await setQuality(docs.map((d) => d.id), 'strong');
  await setQuality([season, harvest].filter(Boolean).map((s) => s.id), 'moderate');
  await setQuality([overrides, onboarding, ...regulatory].filter(Boolean).map((s) => s.id), 'limited');

  // Quality feedback — per item only, no leaderboards.
  const votes: [string | undefined, string | undefined, 'useful' | 'needs_evidence'][] = [
    [docs[0]?.id, u.northwindMember?.id, 'useful'],
    [docs[0]?.id, u.harborMember?.id, 'useful'],
    [season?.id, u.employee?.id, 'useful'],
    [season?.id, u.harborMember?.id, 'useful'],
    [onboarding?.id, u.harborMember?.id, 'needs_evidence'],
    [onboarding?.id, u.employee?.id, 'needs_evidence'],
    [overrides?.id, u.meridianMember?.id, 'needs_evidence'],
  ];
  for (const [sharedInsightId, userId, rating] of votes) {
    if (sharedInsightId && userId) await tx.insert(schema.contributionFeedback).values({ sharedInsightId, userId, rating }).onConflictDoNothing();
  }

  // Comments: a client participant, an Azentio employee, and one held by the sensitive-content check.
  if (docs[0] && u.harborMember) {
    await tx.insert(schema.comments).values({ sharedInsightId: docs[0].id, authorId: u.harborMember.id, authorTenantId: orgs.harbor?.id ?? null, authorKind: 'client', body: 'We see the same pattern: a single failed document forces the whole pack to be resent. Per-document status would help our reviewers.' });
  }
  if (season && u.employee) {
    await tx.insert(schema.comments).values({ sharedInsightId: season.id, authorId: u.employee.id, authorTenantId: null, authorKind: 'employee', body: 'Thanks — this matches what we hear in Financial Analysis workshops. A seasonal baseline option is being explored; no delivery commitment yet.' });
  }
  if (season && u.meridianMember) {
    const body = 'Agreed. Our pricing for seasonal borrowers is adjusted manually today, which takes time every quarter.';
    await tx.insert(schema.comments).values({ sharedInsightId: season.id, authorId: u.meridianMember.id, authorTenantId: orgs.meridian?.id ?? null, authorKind: 'client', body, status: 'held', sensitiveFlags: scanSensitive({ title: '', body }) });
  }

  // Northwind analyst: a bookmark, a saved search and theme subscriptions.
  const noah = u.northwindMember;
  if (noah && orgs.northwind) {
    if (docs[0]) await tx.insert(schema.bookmarks).values({ userId: noah.id, tenantId: orgs.northwind.id, sourceType: 'shared_insight', sourceId: docs[0].id }).onConflictDoNothing();
    const [idea] = await tx.select({ id: schema.ideas.id }).from(schema.ideas).where(eq(schema.ideas.title, 'Pack-level upload status for Document Intelligence')).limit(1);
    if (idea) await tx.insert(schema.bookmarks).values({ userId: noah.id, tenantId: orgs.northwind.id, sourceType: 'idea', sourceId: idea.id }).onConflictDoNothing();
    await tx.insert(schema.savedSearches).values({ userId: noah.id, tenantId: orgs.northwind.id, name: 'Document handling across the community', query: 'upload', filters: { topic: 'Document handling' } });
    for (const name of ['Seasonality context', 'Document upload friction']) {
      if (themes[name]) await tx.insert(schema.themeSubscriptions).values({ userId: noah.id, themeId: themes[name].id }).onConflictDoNothing();
    }
  }
  if (u.employee && themes['Regulatory change cadence']) {
    await tx.insert(schema.themeSubscriptions).values({ userId: u.employee.id, themeId: themes['Regulatory change cadence'].id }).onConflictDoNothing();
  }
}
