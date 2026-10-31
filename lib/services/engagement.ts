import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { schema, withSystemTx, withTenantTx, type Tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/outbox';
import { enforce } from '@/lib/policy/enforce';
import { HttpError, notFound } from '@/lib/http';
import { communityFeed, communityResource, distinctOrgs, orgBand, type Filters } from '@/lib/insights';
import { getKThreshold } from '@/lib/settings';
import { bookmarkSchema, feedbackSchema, savedSearchSchema, SAVED_SEARCH_FILTER_KEYS, IDEA_STATUS_LABELS } from '@/lib/validation';
import type { Principal } from '@/lib/policy/types';

/**
 * Community engagement (§06 CLI-08/09, §10): quality feedback, bookmarks, saved searches and theme subscriptions.
 * Every entry point re-checks the shared-community audience; per-user rows are read and written in the owner's
 * RLS context (user mode, user_id = app_uid()), and only aggregate counts use a system transaction.
 * No leaderboards: counts are per item only — never per organisation or per author.
 */

const ownerTx = <T>(p: Principal, fn: (tx: Tx) => Promise<T>) => withTenantTx(p.userId, p.activeTenantId, fn);

async function requirePublished(tx: Tx, sharedId: string) {
  const [row] = await tx
    .select({ id: schema.sharedInsights.id, title: schema.sharedInsights.title })
    .from(schema.sharedInsights)
    .where(and(eq(schema.sharedInsights.id, sharedId), eq(schema.sharedInsights.status, 'published')))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

// ───────── Quality feedback: "Useful" / "Needs evidence" ─────────

export type FeedbackState = { useful: number; needsEvidence: number; mine: 'useful' | 'needs_evidence' | null };

/** One vote per user per item; a new rating replaces the old one. */
export async function setFeedback(principal: Principal | null, sharedId: string, raw: unknown) {
  await enforce(principal, 'read', { ...communityResource, id: sharedId });
  const { rating } = feedbackSchema.parse(raw);
  const p = principal!;
  await withSystemTx((tx) => requirePublished(tx, sharedId));
  await ownerTx(p, (tx) =>
    tx
      .insert(schema.contributionFeedback)
      .values({ sharedInsightId: sharedId, userId: p.userId, rating })
      .onConflictDoUpdate({ target: [schema.contributionFeedback.sharedInsightId, schema.contributionFeedback.userId], set: { rating, updatedAt: new Date() } }),
  );
  return (await feedbackFor(p, [sharedId]))[sharedId];
}

export async function clearFeedback(principal: Principal | null, sharedId: string) {
  await enforce(principal, 'read', { ...communityResource, id: sharedId });
  const p = principal!;
  await withSystemTx((tx) => requirePublished(tx, sharedId));
  await ownerTx(p, (tx) => tx.delete(schema.contributionFeedback).where(and(eq(schema.contributionFeedback.sharedInsightId, sharedId), eq(schema.contributionFeedback.userId, p.userId))));
  return (await feedbackFor(p, [sharedId]))[sharedId];
}

/** Per-item totals (aggregate only) + the viewer's own vote (read under the owner's RLS). */
async function feedbackFor(p: Principal, ids: string[]): Promise<Record<string, FeedbackState>> {
  const out: Record<string, FeedbackState> = Object.fromEntries(ids.map((id) => [id, { useful: 0, needsEvidence: 0, mine: null }]));
  if (!ids.length) return out;
  const totals = await withSystemTx((tx) =>
    tx
      .select({ id: schema.contributionFeedback.sharedInsightId, rating: schema.contributionFeedback.rating, n: sql<number>`count(*)::int` })
      .from(schema.contributionFeedback)
      .where(inArray(schema.contributionFeedback.sharedInsightId, ids))
      .groupBy(schema.contributionFeedback.sharedInsightId, schema.contributionFeedback.rating),
  );
  for (const t of totals) if (out[t.id]) out[t.id][t.rating === 'useful' ? 'useful' : 'needsEvidence'] = t.n;
  const mine = await ownerTx(p, (tx) => tx.select().from(schema.contributionFeedback).where(inArray(schema.contributionFeedback.sharedInsightId, ids)));
  for (const m of mine) if (out[m.sharedInsightId]) out[m.sharedInsightId].mine = m.rating;
  return out;
}

/** Feedback + bookmark state for the feed cards. Only ids that are currently published are answered. */
export async function engagementFor(principal: Principal | null, rawIds: string[]) {
  await enforce(principal, 'read', communityResource);
  const p = principal!;
  const requested = [...new Set(rawIds.filter((i) => typeof i === 'string' && i.length <= 64))].slice(0, 200);
  const published = requested.length
    ? (await withSystemTx((tx) => tx.select({ id: schema.sharedInsights.id }).from(schema.sharedInsights).where(and(inArray(schema.sharedInsights.id, requested), eq(schema.sharedInsights.status, 'published'))))).map((r) => r.id)
    : [];
  const feedback = await feedbackFor(p, published);
  const marks = published.length
    ? await ownerTx(p, (tx) => tx.select({ sourceId: schema.bookmarks.sourceId }).from(schema.bookmarks).where(and(eq(schema.bookmarks.sourceType, 'shared_insight'), inArray(schema.bookmarks.sourceId, published))))
    : [];
  const bookmarked = new Set(marks.map((m) => m.sourceId));
  return Object.fromEntries(published.map((id) => [id, { ...feedback[id], bookmarked: bookmarked.has(id) }]));
}

// ───────── Bookmarks ─────────

type BookmarkView = { id: string; sourceType: string; sourceId: string; createdAt: string } & (
  | { available: true; title: string; href: string; detail: string | null }
  | { available: false; title: null; href: null; detail: string }
);

/** Checks the caller can currently see the bookmarked record. A bookmark never grants access. */
async function assertBookmarkable(p: Principal, sourceType: string, sourceId: string) {
  await enforce(p, 'read', { ...communityResource, id: sourceId });
  await withSystemTx(async (tx) => {
    if (sourceType === 'shared_insight') return requirePublished(tx, sourceId);
    const [idea] = await tx.select({ id: schema.ideas.id, publicUpdate: schema.ideas.publicUpdate }).from(schema.ideas).where(eq(schema.ideas.id, sourceId)).limit(1);
    if (!idea || !idea.publicUpdate.trim()) throw notFound();
  });
}

export async function addBookmark(principal: Principal | null, raw: unknown) {
  if (!principal) throw new HttpError(401, 'unauthenticated');
  const input = bookmarkSchema.parse(raw);
  await assertBookmarkable(principal, input.sourceType, input.sourceId);
  await ownerTx(principal, async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.bookmarks);
    if (n >= 200) throw new HttpError(409, 'bookmark_limit', 'You can keep up to 200 bookmarks.');
    await tx.insert(schema.bookmarks).values({ userId: principal.userId, tenantId: principal.activeTenantId, sourceType: input.sourceType, sourceId: input.sourceId }).onConflictDoNothing();
  });
  return { bookmarked: true };
}

export async function removeBookmark(principal: Principal | null, raw: unknown) {
  if (!principal) throw new HttpError(401, 'unauthenticated');
  const input = bookmarkSchema.parse(raw);
  await ownerTx(principal, (tx) =>
    tx.delete(schema.bookmarks).where(and(eq(schema.bookmarks.userId, principal.userId), eq(schema.bookmarks.sourceType, input.sourceType), eq(schema.bookmarks.sourceId, input.sourceId))),
  );
  return { bookmarked: false };
}

const UNAVAILABLE_REASON: Record<string, string> = {
  unpublished: 'Temporarily unpublished while moderators review a report',
  withdrawn: 'Withdrawn by the contributor',
  removed: 'Removed by moderators',
};

/** Visibility is re-evaluated at read time: anything no longer visible shows as unavailable, with no title. */
export async function listBookmarks(principal: Principal | null): Promise<BookmarkView[]> {
  await enforce(principal, 'read', communityResource);
  const p = principal!;
  const rows = await ownerTx(p, (tx) => tx.select().from(schema.bookmarks).orderBy(desc(schema.bookmarks.createdAt)));
  const sharedIds = rows.filter((r) => r.sourceType === 'shared_insight').map((r) => r.sourceId);
  const ideaIds = rows.filter((r) => r.sourceType === 'idea').map((r) => r.sourceId);
  const { shared, ideas } = await withSystemTx(async (tx) => ({
    shared: sharedIds.length ? await tx.select({ id: schema.sharedInsights.id, title: schema.sharedInsights.title, status: schema.sharedInsights.status, topic: schema.sharedInsights.topic, period: schema.sharedInsights.periodQuarter }).from(schema.sharedInsights).where(inArray(schema.sharedInsights.id, sharedIds)) : [],
    ideas: ideaIds.length ? await tx.select({ id: schema.ideas.id, title: schema.ideas.title, status: schema.ideas.status, publicUpdate: schema.ideas.publicUpdate }).from(schema.ideas).where(inArray(schema.ideas.id, ideaIds)) : [],
  }));
  const sMap = new Map(shared.map((s) => [s.id, s]));
  const iMap = new Map(ideas.map((i) => [i.id, i]));
  const ideasHref = p.memberships.some((m) => m.orgId === p.activeTenantId && m.orgType === 'client') ? '/w/_/ideas' : '/hub/ideas';
  return rows.map((r): BookmarkView => {
    const base = { id: r.id, sourceType: r.sourceType, sourceId: r.sourceId, createdAt: r.createdAt.toISOString() };
    if (r.sourceType === 'shared_insight') {
      const s = sMap.get(r.sourceId);
      if (s?.status === 'published') return { ...base, available: true, title: s.title, href: `/community/${s.id}`, detail: [s.topic, s.period].filter(Boolean).join(' · ') || null };
      return { ...base, available: false, title: null, href: null, detail: `No longer available${s ? ` — ${UNAVAILABLE_REASON[s.status] ?? 'not visible'}` : ''}` };
    }
    if (r.sourceType === 'idea') {
      const i = iMap.get(r.sourceId);
      if (i && i.publicUpdate.trim()) return { ...base, available: true, title: i.title, href: ideasHref, detail: IDEA_STATUS_LABELS[i.status] };
    }
    return { ...base, available: false, title: null, href: null, detail: 'No longer available' };
  });
}

// ───────── Saved searches ─────────

export type SavedSearchView = { id: string; name: string; query: string; filters: Filters; createdAt: string };

const toSavedView = (r: typeof schema.savedSearches.$inferSelect): SavedSearchView => ({
  id: r.id,
  name: r.name,
  query: r.query,
  filters: Object.fromEntries(Object.entries(r.filters ?? {}).filter(([k, v]) => (SAVED_SEARCH_FILTER_KEYS as readonly string[]).includes(k) && typeof v === 'string' && v)) as Filters,
  createdAt: r.createdAt.toISOString(),
});

/** Persists the query + filters only — never results. */
export async function createSavedSearch(principal: Principal | null, raw: unknown) {
  await enforce(principal, 'read', communityResource);
  const p = principal!;
  const input = savedSearchSchema.parse(raw);
  const filters = Object.fromEntries(Object.entries(input.filters).filter(([, v]) => !!v)) as Record<string, string>;
  const [row] = await ownerTx(p, async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.savedSearches);
    if (n >= 25) throw new HttpError(409, 'saved_search_limit', 'You can keep up to 25 saved searches.');
    return tx.insert(schema.savedSearches).values({ userId: p.userId, tenantId: p.activeTenantId, name: input.name, query: input.query, filters }).returning();
  });
  return toSavedView(row);
}

export async function listSavedSearches(principal: Principal | null) {
  await enforce(principal, 'read', communityResource);
  const rows = await ownerTx(principal!, (tx) => tx.select().from(schema.savedSearches).orderBy(desc(schema.savedSearches.createdAt)));
  return rows.map(toSavedView);
}

export async function deleteSavedSearch(principal: Principal | null, id: string) {
  if (!principal) throw new HttpError(401, 'unauthenticated');
  const deleted = await ownerTx(principal, (tx) => tx.delete(schema.savedSearches).where(and(eq(schema.savedSearches.id, id), eq(schema.savedSearches.userId, principal.userId))).returning({ id: schema.savedSearches.id }));
  if (!deleted.length) throw notFound();
  return { deleted: true };
}

/** Re-runs through communityFeed(): current visibility, k-threshold and differencing rules apply at run time. */
export async function runSavedSearch(principal: Principal | null, id: string) {
  await enforce(principal, 'read', communityResource);
  const [row] = await ownerTx(principal!, (tx) => tx.select().from(schema.savedSearches).where(eq(schema.savedSearches.id, id)).limit(1));
  if (!row) throw notFound();
  const search = toSavedView(row);
  const feed = await communityFeed(principal, search.filters);
  const q = search.query.toLowerCase();
  const results = q ? feed.results.filter((r) => `${r.title} ${r.body}`.toLowerCase().includes(q)) : feed.results;
  return { search, results, count: results.length, applied: feed.applied, rejected: feed.rejected, k: feed.k };
}

// ───────── Theme subscriptions ─────────

export async function listSubscriptions(principal: Principal | null) {
  await enforce(principal, 'read', communityResource);
  const rows = await ownerTx(principal!, (tx) => tx.select({ themeId: schema.themeSubscriptions.themeId, createdAt: schema.themeSubscriptions.createdAt }).from(schema.themeSubscriptions));
  if (!rows.length) return [];
  const themes = await withSystemTx((tx) => tx.select({ id: schema.themes.id, name: schema.themes.name }).from(schema.themes).where(inArray(schema.themes.id, rows.map((r) => r.themeId))));
  const name = new Map(themes.map((t) => [t.id, t.name]));
  return rows.filter((r) => name.has(r.themeId)).map((r) => ({ themeId: r.themeId, name: name.get(r.themeId)!, since: r.createdAt.toISOString() }));
}

export async function subscribeTheme(principal: Principal | null, themeId: string) {
  await enforce(principal, 'read', communityResource);
  const p = principal!;
  const [theme] = await withSystemTx((tx) => tx.select({ id: schema.themes.id }).from(schema.themes).where(eq(schema.themes.id, themeId)).limit(1));
  if (!theme) throw notFound();
  await ownerTx(p, (tx) => tx.insert(schema.themeSubscriptions).values({ userId: p.userId, themeId }).onConflictDoNothing());
  return { subscribed: true };
}

export async function unsubscribeTheme(principal: Principal | null, themeId: string) {
  await enforce(principal, 'read', communityResource);
  const p = principal!;
  await ownerTx(p, (tx) => tx.delete(schema.themeSubscriptions).where(and(eq(schema.themeSubscriptions.userId, p.userId), eq(schema.themeSubscriptions.themeId, themeId))));
  return { subscribed: false };
}

/** Distinct-org aggregate for one theme (published evidence only). Tenant ids stay inside this function. */
export async function themeStats(tx: Tx, themeId: string, k: number) {
  const rows = await tx
    .select({ id: schema.sharedInsights.id, sourceTenantId: schema.sharedInsights.sourceTenantId, publishedAt: schema.sharedInsights.publishedAt })
    .from(schema.themeLinks)
    .innerJoin(schema.sharedInsights, eq(schema.sharedInsights.id, schema.themeLinks.sharedInsightId))
    .where(and(eq(schema.themeLinks.themeId, themeId), eq(schema.sharedInsights.status, 'published')));
  const n = distinctOrgs(rows);
  return { rows, established: n >= k, band: orgBand(n, k) };
}

/** Users who may currently read the shared community (active client membership or active employee). */
export async function communityAudience(tx: Tx, userIds: string[]) {
  if (!userIds.length) return new Map<string, { kind: 'client' | 'employee' }>();
  const ms = await tx
    .select({ userId: schema.memberships.userId, role: schema.memberships.role, orgType: schema.organisations.type })
    .from(schema.memberships)
    .innerJoin(schema.organisations, eq(schema.organisations.id, schema.memberships.orgId))
    .where(and(inArray(schema.memberships.userId, userIds), eq(schema.memberships.status, 'active')));
  const out = new Map<string, { kind: 'client' | 'employee' }>();
  for (const m of ms) {
    if (m.orgType === 'azentio' && m.role === 'employee') out.set(m.userId, { kind: 'employee' });
    else if (m.orgType === 'client' && !out.has(m.userId)) out.set(m.userId, { kind: 'client' });
  }
  return out;
}

export const communityHref = (kind: 'client' | 'employee') => (kind === 'employee' ? '/hub/community' : '/w/_/community');

/**
 * Called after a moderator approves a theme-linked contribution. The message names the theme only:
 * a band is shown only when the theme has ≥ k distinct organisations; never the contributor's organisation.
 * The contributor themself is not notified through this channel (they already get the moderation decision).
 */
export async function notifyThemeSubscribers(themeId: string, sharedId: string, contributorId: string | null) {
  await withSystemTx(async (tx) => {
    const k = await getKThreshold(tx);
    const [theme] = await tx.select({ id: schema.themes.id, name: schema.themes.name }).from(schema.themes).where(eq(schema.themes.id, themeId)).limit(1);
    if (!theme) return;
    const subs = await tx.select({ userId: schema.themeSubscriptions.userId }).from(schema.themeSubscriptions).where(eq(schema.themeSubscriptions.themeId, themeId));
    const audience = await communityAudience(tx, subs.map((s) => s.userId));
    const stats = await themeStats(tx, themeId, k);
    const body = stats.established
      ? `A new approved contribution was added. ${stats.band} contributing organisations so far. Popularity is not prevalence.`
      : 'A new approved contribution was added. This theme is still emerging, so counts are withheld until enough organisations contribute.';
    for (const s of subs) {
      if (s.userId === contributorId) continue;
      const a = audience.get(s.userId);
      if (!a) continue;
      await notify(tx, { userId: s.userId, type: 'theme_update', title: `New in “${theme.name}”`, body, link: communityHref(a.kind), dedupeKey: `theme-new:${themeId}:${sharedId}:${s.userId}` });
    }
    await audit(tx, { actorId: null, action: 'theme.subscribers_notified', resourceType: 'theme', resourceId: themeId, meta: { recipients: subs.length } });
  });
}
