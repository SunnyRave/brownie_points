/**
 * Assisted insights (§10): duplicate detection, cluster suggestions, trend-change summaries and assisted
 * prioritisation.
 *
 * SIMILARITY IS LEXICAL (TF-IDF cosine + character-trigram Jaccard), NOT SEMANTIC EMBEDDINGS. It is computed
 * in-process over text the caller is already allowed to see. The production path is an embeddings index
 * (e.g. pgvector) — with the same rule: the audience partition filter (published shared copies only, or the
 * moderator-RLS-visible queue) is applied BEFORE similarity, so raw private records never enter the index,
 * logs or any AI provider payload.
 *
 * Safeguards shared by every function here:
 *  - Organisation breadth is always DISTINCT organisations (repeated posts from one org count once),
 *    shown only as a band at or above k, never as a raw count, never with an org name or tenant id.
 *  - Below k: no counts, no evidence links, no trend direction ("emerging").
 *  - Every output carries an uncertainty / limitations string: lexical, small sample,
 *    popularity ≠ prevalence ≠ causation.
 */
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { schema, withModeratorTx, withSystemTx } from '@/lib/db';
import { enforce } from '@/lib/policy/enforce';
import { getKThreshold } from '@/lib/settings';
import { notFound } from '@/lib/http';
import { communityResource, distinctOrgs, orgBand } from '@/lib/insights';
import type { Principal } from '@/lib/policy/types';

// ───────────────────────── Text processing (pure) ─────────────────────────

export const SIMILARITY_METHOD = 'Lexical similarity (TF-IDF cosine + title trigram overlap) — not semantic embeddings';

export const POPULARITY_CAVEAT =
  'Popularity is not prevalence: these are self-selected contributions from a small number of organisations, not a market sample, and co-occurrence is not proof of cause.';

const STOPWORDS = new Set(
  (
    'a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours one two three per via within without across among however etc ' +
    'which whose ltd inc plc using used use although though whether'
  ).split(/\s+/),
);

const SUFFIXES = ['ization', 'isation', 'ations', 'ation', 'ality', 'ings', 'ing', 'ness', 'ments', 'ment', 'ies', 'ied', 'ers', 'er', 'ed', 'es', 'ly', 'al', 's'];

/** Light suffix-stripping stemmer (Porter-lite). Keeps a stem of at least 4 characters. */
export function stem(word: string): string {
  let w = word;
  for (let pass = 0; pass < 2; pass++) {
    const suf = SUFFIXES.find((s) => w.endsWith(s) && w.length - s.length >= 4);
    if (!suf) break;
    w = w.slice(0, -suf.length);
    if (suf === 'ies' || suf === 'ied') w += 'y';
  }
  return w;
}

export type Token = { stem: string; surface: string };

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const raw of text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || /^\d+$/.test(raw) || STOPWORDS.has(raw)) continue;
    out.push({ stem: stem(raw), surface: raw });
  }
  return out;
}

export type Vector = Map<string, number>;
export type Corpus = { vectors: Vector[]; surfaces: Map<string, string>; idf: Map<string, number> };

/** TF-IDF with sublinear tf and smoothed idf; vectors are L2-normalised so cosine = dot product. */
export function buildTfIdf(docs: string[]): Corpus {
  const toks = docs.map(tokenize);
  const df = new Map<string, number>();
  const surfaceCount = new Map<string, Map<string, number>>();
  for (const ts of toks) {
    for (const s of new Set(ts.map((t) => t.stem))) df.set(s, (df.get(s) ?? 0) + 1);
    for (const t of ts) {
      const m = surfaceCount.get(t.stem) ?? new Map<string, number>();
      m.set(t.surface, (m.get(t.surface) ?? 0) + 1);
      surfaceCount.set(t.stem, m);
    }
  }
  const n = docs.length;
  const idf = new Map<string, number>();
  for (const [s, d] of df) idf.set(s, Math.log((n + 1) / (d + 1)) + 1);
  const vectors = toks.map((ts) => {
    const tf = new Map<string, number>();
    for (const t of ts) tf.set(t.stem, (tf.get(t.stem) ?? 0) + 1);
    const v: Vector = new Map();
    let norm = 0;
    for (const [s, c] of tf) {
      const w = (1 + Math.log(c)) * idf.get(s)!;
      v.set(s, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [s, w] of v) v.set(s, w / norm);
    return v;
  });
  const surfaces = new Map<string, string>();
  for (const [s, m] of surfaceCount) surfaces.set(s, [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0]);
  return { vectors, surfaces, idf };
}

export function cosine(a: Vector, b: Vector): number {
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, w] of small) dot += w * (big.get(k) ?? 0);
  return Math.min(1, Math.max(0, dot));
}

/** Terms contributing most to the overlap, as readable surface forms. */
export function sharedTerms(a: Vector, b: Vector, surfaces: Map<string, string>, limit = 6): string[] {
  return [...a.entries()]
    .filter(([k]) => b.has(k))
    .map(([k, w]) => [k, w * b.get(k)!] as const)
    .sort((x, y) => y[1] - x[1])
    .slice(0, limit)
    .map(([k]) => surfaces.get(k) ?? k);
}

function trigrams(s: string): Set<string> {
  const t = ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** Character-trigram Jaccard: catches near-identical titles (typos, reordered punctuation). */
export function trigramJaccard(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Thresholds (documented in the UI). Tuned on the synthetic seed; lexical scores are conservative. */
export const DUPLICATE_THRESHOLDS = { likely: 0.6, possible: 0.15 } as const;
export const CLUSTER_THRESHOLD = 0.15;
export const MAX_CLUSTER_INPUT = 1000;

/** Combined score: body+title TF-IDF cosine dominates; title trigram overlap catches near-identical headlines. */
export function combinedScore(cos: number, titleTri: number) {
  return Math.round((0.75 * cos + 0.25 * titleTri) * 1000) / 1000;
}

export type MatchStrength = 'likely_duplicate' | 'possible_duplicate';
export const strengthOf = (score: number): MatchStrength | null =>
  score >= DUPLICATE_THRESHOLDS.likely ? 'likely_duplicate' : score >= DUPLICATE_THRESHOLDS.possible ? 'possible_duplicate' : null;

/**
 * Average-linkage agglomerative clustering on cosine similarity. Merges the most similar pair of clusters while
 * their average pairwise similarity ≥ threshold. O(n³) — fine for the bounded input (MAX_CLUSTER_INPUT).
 */
export function agglomerate(vectors: Vector[], threshold = CLUSTER_THRESHOLD): { members: number[]; cohesion: number }[] {
  const n = vectors.length;
  const sim: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : cosine(vectors[i], vectors[j]))));
  let clusters = vectors.map((_, i) => [i]);
  const avg = (a: number[], b: number[]) => {
    let s = 0;
    for (const i of a) for (const j of b) s += sim[i][j];
    return s / (a.length * b.length);
  };
  for (;;) {
    let best = -1;
    let bi = -1;
    let bj = -1;
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        const s = avg(clusters[i], clusters[j]);
        if (s > best) [best, bi, bj] = [s, i, j];
      }
    if (bi < 0 || best < threshold) break;
    clusters = [...clusters.filter((_, x) => x !== bi && x !== bj), [...clusters[bi], ...clusters[bj]]];
  }
  return clusters.map((m) => {
    let s = 0;
    let c = 0;
    for (let a = 0; a < m.length; a++) for (let b = a + 1; b < m.length; b++) (s += sim[m[a]][m[b]]), c++;
    return { members: m.sort((a, b) => a - b), cohesion: c ? Math.round((s / c) * 100) / 100 : 1 };
  });
}

/** Top label terms of a cluster: summed TF-IDF weight across its members. */
export function clusterLabel(vectors: Vector[], surfaces: Map<string, string>, limit = 3): string[] {
  const acc = new Map<string, number>();
  for (const v of vectors) for (const [k, w] of v) acc.set(k, (acc.get(k) ?? 0) + w);
  return [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k]) => surfaces.get(k) ?? k);
}

// ───────────────────────── Periods + trend rules (pure) ─────────────────────────

/** "2026 Q2" → 8106; "2026 Q2–Q3" → end quarter (Q3). Returns null when unparseable. */
export function quarterKey(period: string | null | undefined): number | null {
  if (!period) return null;
  const year = period.match(/(\d{4})/);
  const qs = [...period.matchAll(/Q([1-4])/g)].map((m) => Number(m[1]));
  if (!year || !qs.length) return null;
  const years = [...period.matchAll(/(\d{4})/g)].map((m) => Number(m[1]));
  return years[years.length - 1] * 4 + (qs[qs.length - 1] - 1);
}
export const quarterLabel = (key: number) => `${Math.floor(key / 4)} Q${(key % 4) + 1}`;

export type TrendDirection = 'new_evidence' | 'steady' | 'no_new_evidence' | 'insufficient';

/**
 * Differencing-safe trend rule. A direction is produced only when the theme has ≥ k distinct orgs overall AND
 * each compared window (latest quarter vs. earlier) has either 0 or ≥ k distinct orgs. Otherwise comparing the
 * windows could isolate fewer than k organisations, so we say nothing.
 */
export function trendDirection(totalOrgs: number, recentOrgs: number, earlierOrgs: number, k: number): TrendDirection {
  if (totalOrgs < k) return 'insufficient';
  const ok = (n: number) => n === 0 || n >= k;
  if (!ok(recentOrgs) || !ok(earlierOrgs)) return 'insufficient';
  if (recentOrgs === 0) return 'no_new_evidence';
  if (earlierOrgs === 0) return 'new_evidence';
  return 'steady';
}

export const TREND_TEXT: Record<TrendDirection, string> = {
  new_evidence: 'New evidence this quarter — all contributions so far fall in the latest observation period.',
  steady: 'Steady — evidence from enough organisations in both the latest and earlier observation periods.',
  no_new_evidence: 'No new evidence in the latest observation period.',
  insufficient: 'Insufficient evidence to describe a trend.',
};

// ───────────────────────── Prioritisation score (pure, documented) ─────────────────────────

export const PRIORITY_WEIGHTS = { breadth: 35, recency: 20, quality: 25, evidenceSufficiency: 10, unaddressed: 10 } as const;
export const MIN_FEEDBACK_FOR_SIGNAL = 3;

export type PriorityInput = {
  band: string; // orgBand (only for ≥ k)
  quartersBehindLatest: number | null;
  quality: { strong: number; moderate: number; limited: number; unknown: number };
  feedback: { useful: number; needsEvidence: number };
  hasIdea: boolean;
};
export type PriorityFactor = { key: keyof typeof PRIORITY_WEIGHTS; label: string; weight: number; value: number; points: number; note: string };

export function priorityScore(i: PriorityInput): { total: number; factors: PriorityFactor[] } {
  const f: PriorityFactor[] = [];
  const add = (key: keyof typeof PRIORITY_WEIGHTS, label: string, value: number, note: string) =>
    f.push({ key, label, weight: PRIORITY_WEIGHTS[key], value: Math.round(value * 100) / 100, points: Math.round(value * PRIORITY_WEIGHTS[key] * 10) / 10, note });

  const breadth = i.band === '10+' ? 1 : i.band === '6–10' ? 2 / 3 : 1 / 3;
  add('breadth', 'Breadth (distinct organisations, banded)', breadth, `Band ${i.band}. Banded so one large contributor cannot move the score; repeated posts from one organisation count once.`);

  const q = i.quartersBehindLatest;
  const recency = q === null ? 0 : q <= 0 ? 1 : q === 1 ? 0.6 : q === 2 ? 0.3 : 0;
  add('recency', 'Recency of evidence', recency, q === null ? 'No dated evidence.' : q <= 0 ? 'Evidence in the latest observation period.' : `Latest evidence ${q} quarter${q > 1 ? 's' : ''} before the latest period.`);

  const rated = i.quality.strong + i.quality.moderate + i.quality.limited;
  const quality = rated ? (i.quality.strong * 1 + i.quality.moderate * 0.6 + i.quality.limited * 0.2) / rated : 0.5;
  add('quality', 'Reviewer-assessed evidence quality', quality, rated ? `${rated} of ${rated + i.quality.unknown} items assessed by moderators${i.quality.unknown ? '; unassessed items are not counted' : ''}.` : 'Not yet assessed by a moderator — scored neutral (0.5), not assumed good or bad.');

  const votes = i.feedback.useful + i.feedback.needsEvidence;
  const share = votes ? i.feedback.needsEvidence / votes : 0;
  const suff = votes >= MIN_FEEDBACK_FOR_SIGNAL ? 1 - share : 0.5;
  add('evidenceSufficiency', 'Community “needs evidence” signal', suff, votes >= MIN_FEEDBACK_FOR_SIGNAL ? `${Math.round(share * 100)}% of ratings asked for more evidence.` : `Fewer than ${MIN_FEEDBACK_FOR_SIGNAL} ratings — scored neutral (0.5).`);

  add('unaddressed', 'Not yet addressed by an idea', i.hasIdea ? 0 : 1, i.hasIdea ? 'An improvement idea already links this evidence.' : 'No improvement idea links this evidence yet.');

  return { total: Math.round(f.reduce((s, x) => s + x.points, 0)), factors: f };
}

// ───────────────────────── Services ─────────────────────────

const queueResource = { type: 'moderation_queue', audience: { kind: 'grant' as const, grant: 'moderator' as const } };
const ownerResource = { type: 'idea', audience: { kind: 'grant' as const, grant: 'product_owner' as const } };
const QUEUE_STATES = ['submitted', 'in_review', 'under_report'];

type PublishedLite = { id: string; title: string; body: string; topic: string | null; period: string | null; org: string; sourceObs: string; quality: string | null };

/** Published shared copies only — the community-audience partition. Server-only fields (org/sourceObs) never leave this module. */
async function loadPublishedLite(): Promise<PublishedLite[]> {
  return withSystemTx((tx) =>
    tx
      .select({ id: schema.sharedInsights.id, title: schema.sharedInsights.title, body: schema.sharedInsights.body, topic: schema.sharedInsights.topic, period: schema.sharedInsights.periodQuarter, org: schema.sharedInsights.sourceTenantId, sourceObs: schema.sharedInsights.sourceObservationId, quality: schema.sharedInsights.evidenceQuality })
      .from(schema.sharedInsights)
      .where(eq(schema.sharedInsights.status, 'published'))
      .orderBy(desc(schema.sharedInsights.publishedAt)),
  );
}

async function loadThemeLinks() {
  return withSystemTx(async (tx) => {
    const themes = await tx.select({ id: schema.themes.id, name: schema.themes.name }).from(schema.themes);
    const links = await tx.select().from(schema.themeLinks);
    return { themes, links };
  });
}

const docText = (d: { title: string; body: string; topic?: string | null }) => `${d.title}. ${d.title}. ${d.body} ${d.topic ?? ''}`;

export type DuplicateMatch = {
  kind: 'shared_insight' | 'queue_item';
  id: string;
  title: string;
  href: string;
  score: number;
  strength: MatchStrength;
  matchedTerms: string[];
  /** True when the match comes from the same contributing organisation — a repeated post, not independent evidence. Never the org itself. */
  sameOrganisation: boolean;
  theme: { id: string; name: string } | null;
};

export type DuplicateResult = { method: string; thresholds: typeof DUPLICATE_THRESHOLDS; matches: DuplicateMatch[]; note: string };

type QueueRow = { id: string; title: string; body: string; topic: string | null; org: string; state: string };

/** Moderator-RLS-visible observations only: drafts, private and org-only rows are invisible here by policy. */
async function loadModeratorView(moderatorId: string, focusId?: string) {
  return withModeratorTx(moderatorId, async (tx) => {
    const cols = { id: schema.observations.id, title: schema.observations.title, body: schema.observations.body, topic: schema.observations.topic, org: schema.observations.tenantId, state: schema.observations.state };
    const queue: QueueRow[] = await tx.select(cols).from(schema.observations).where(inArray(schema.observations.state, QUEUE_STATES)).orderBy(desc(schema.observations.updatedAt));
    let focus: QueueRow | null = null;
    if (focusId) {
      [focus] = await tx.select(cols).from(schema.observations).where(and(eq(schema.observations.id, focusId), eq(schema.observations.visibilityIntent, 'propose_shared'), ne(schema.observations.state, 'draft'))).limit(1);
      focus ??= null;
    }
    return { queue, focus };
  });
}

function matchesFor(item: QueueRow, queue: QueueRow[], published: PublishedLite[], themeOf: Map<string, { id: string; name: string }>, limit: number): DuplicateMatch[] {
  const sharedCands = published.filter((p) => p.sourceObs !== item.id); // never match the item's own shared copy
  const queueCands = queue.filter((q) => q.id !== item.id);
  const docs = [item, ...sharedCands, ...queueCands];
  const corpus = buildTfIdf(docs.map(docText));
  const v0 = corpus.vectors[0];
  const out: DuplicateMatch[] = [];
  docs.forEach((d, i) => {
    if (i === 0) return;
    const score = combinedScore(cosine(v0, corpus.vectors[i]), trigramJaccard(item.title, d.title));
    const strength = strengthOf(score);
    if (!strength) return;
    const isShared = i <= sharedCands.length;
    out.push({
      kind: isShared ? 'shared_insight' : 'queue_item',
      id: d.id,
      title: d.title,
      href: isShared ? `/community/${d.id}` : `/moderate/${d.id}`,
      score,
      strength,
      matchedTerms: sharedTerms(v0, corpus.vectors[i], corpus.surfaces),
      sameOrganisation: d.org === item.org,
      theme: isShared ? themeOf.get(d.id) ?? null : null,
    });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

const DUP_NOTE =
  'Lexical similarity only (shared wording), not semantic understanding. A high score suggests the same issue; a moderator decides. Same-organisation matches are repeated posts and never count as independent evidence.';

async function themeIndex() {
  const { themes, links } = await loadThemeLinks();
  const name = new Map(themes.map((t) => [t.id, t.name]));
  const themeOf = new Map<string, { id: string; name: string }>();
  for (const l of links) if (!themeOf.has(l.sharedInsightId)) themeOf.set(l.sharedInsightId, { id: l.themeId, name: name.get(l.themeId) ?? '' });
  return themeOf;
}

/**
 * Possible duplicates for one item under review: compared against published shared copies and the other items
 * in the moderator-visible queue. Never reads drafts / private / org-only records (moderator RLS).
 */
export async function findPossibleDuplicates(principal: Principal | null, observationId: string, limit = 5): Promise<DuplicateResult> {
  await enforce(principal, 'moderate', { ...queueResource, id: observationId });
  const { queue, focus } = await loadModeratorView(principal!.userId, observationId);
  if (!focus) throw notFound();
  const [published, themeOf] = await Promise.all([loadPublishedLite(), themeIndex()]);
  return { method: SIMILARITY_METHOD, thresholds: DUPLICATE_THRESHOLDS, matches: matchesFor(focus, queue, published, themeOf, limit), note: DUP_NOTE };
}

/** Assist page overview: every queue item with its top match (one corpus load). */
export async function queueDuplicateOverview(principal: Principal | null) {
  await enforce(principal, 'moderate', queueResource);
  const { queue } = await loadModeratorView(principal!.userId);
  const [published, themeOf] = await Promise.all([loadPublishedLite(), themeIndex()]);
  return {
    method: SIMILARITY_METHOD,
    note: DUP_NOTE,
    items: queue.map((q) => ({ id: q.id, title: q.title, state: q.state, topic: q.topic, top: matchesFor(q, queue, published, themeOf, 1)[0] ?? null })),
  };
}

export type ClusterSuggestion = {
  label: string[];
  members: { id: string; title: string; period: string | null; theme: { id: string; name: string } | null }[];
  cohesion: number;
  orgBand: string | null;
  status: 'existing_theme' | 'candidate_new_theme' | 'emerging';
  statusText: string;
  themes: { id: string; name: string; linkedMembers: number }[];
  unlinkedMembers: number;
  uncertainty: string;
};

/** Cluster suggestions over PUBLISHED SHARED COPIES only. Moderators decide whether to create or link themes. */
export async function suggestClusters(principal: Principal | null): Promise<{ method: string; threshold: number; k: number; clusters: ClusterSuggestion[]; note: string }> {
  await enforce(principal, 'moderate', queueResource);
  const k = await getKThreshold();
  const published = (await loadPublishedLite()).slice(0, MAX_CLUSTER_INPUT);
  const { themes, links } = await loadThemeLinks();
  const themeName = new Map(themes.map((t) => [t.id, t.name]));
  const linksBy = new Map<string, string[]>();
  for (const l of links) linksBy.set(l.sharedInsightId, [...(linksBy.get(l.sharedInsightId) ?? []), l.themeId]);

  const corpus = buildTfIdf(published.map(docText));
  const raw = agglomerate(corpus.vectors).filter((c) => c.members.length >= 2);
  const clusters: ClusterSuggestion[] = raw.map((c) => {
    const rows = c.members.map((i) => published[i]);
    const n = distinctOrgs(rows.map((r) => ({ sourceTenantId: r.org })));
    const themeCounts = new Map<string, number>();
    let unlinked = 0;
    for (const r of rows) {
      const ts = linksBy.get(r.id) ?? [];
      if (!ts.length) unlinked++;
      for (const t of ts) themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);
    }
    const themed = themeCounts.size > 0;
    const status: ClusterSuggestion['status'] = themed ? 'existing_theme' : n >= k ? 'candidate_new_theme' : 'emerging';
    const statusText =
      status === 'existing_theme'
        ? unlinked
          ? `Overlaps an existing theme; ${unlinked} member${unlinked > 1 ? 's are' : ' is'} not yet linked — consider linking.`
          : 'Already covered by an existing theme.'
        : status === 'candidate_new_theme'
          ? `Candidate new theme — at least ${k} distinct organisations. Review wording before creating.`
          : `Emerging — fewer than ${k} distinct organisations. Do not publish counts.`;
    const sameOrgOnly = n === 1;
    return {
      label: clusterLabel(c.members.map((i) => corpus.vectors[i]), corpus.surfaces),
      members: rows.map((r) => {
        const t = linksBy.get(r.id)?.[0];
        return { id: r.id, title: r.title, period: r.period, theme: t ? { id: t, name: themeName.get(t) ?? '' } : null };
      }),
      cohesion: c.cohesion,
      orgBand: orgBand(n, k),
      status,
      statusText,
      themes: [...themeCounts.entries()].map(([id, linkedMembers]) => ({ id, name: themeName.get(id) ?? '', linkedMembers })),
      unlinkedMembers: unlinked,
      uncertainty: [
        `Grouped by shared wording (average similarity ${c.cohesion}); lexical, not semantic — differently-worded reports of the same issue may be missed.`,
        n < k ? 'Small sample.' : n < 2 * k ? 'Small sample — treat as indicative only.' : null,
        sameOrgOnly ? 'All members come from one organisation: repeated posts, not independent evidence.' : null,
        'A cluster is not prevalence or proof of cause.',
      ].filter(Boolean).join(' '),
    };
  });
  const order = { candidate_new_theme: 0, existing_theme: 1, emerging: 2 } as const;
  clusters.sort((a, b) => order[a.status] - order[b.status] || b.members.length - a.members.length);
  return { method: SIMILARITY_METHOD, threshold: CLUSTER_THRESHOLD, k, clusters, note: POPULARITY_CAVEAT };
}

async function themeRows() {
  return withSystemTx(async (tx) => {
    const themes = await tx.select().from(schema.themes).orderBy(desc(schema.themes.updatedAt));
    const links = await tx
      .select({ themeId: schema.themeLinks.themeId, id: schema.sharedInsights.id, title: schema.sharedInsights.title, period: schema.sharedInsights.periodQuarter, org: schema.sharedInsights.sourceTenantId, quality: schema.sharedInsights.evidenceQuality })
      .from(schema.themeLinks)
      .innerJoin(schema.sharedInsights, eq(schema.sharedInsights.id, schema.themeLinks.sharedInsightId))
      .where(eq(schema.sharedInsights.status, 'published'));
    const [latest] = await tx.select({ periods: sql<string[]>`coalesce(array_agg(distinct ${schema.sharedInsights.periodQuarter}), '{}')` }).from(schema.sharedInsights).where(eq(schema.sharedInsights.status, 'published'));
    const keys = (latest?.periods ?? []).map(quarterKey).filter((x): x is number => x !== null);
    return { themes, links, latestKey: keys.length ? Math.max(...keys) : null };
  });
}

export type TrendChange = {
  themeId: string;
  name: string;
  direction: TrendDirection;
  text: string;
  orgBand: string | null;
  latestPeriod: string | null;
  comparedPeriod: string | null;
  evidence: { id: string; title: string; period: string | null }[];
  confidence: string;
  limitations: string;
};

/** Trend-change summaries per theme, using DISTINCT ORGANISATIONS per window (never post counts). */
export async function themeTrendChanges(principal: Principal | null): Promise<{ k: number; latestPeriod: string | null; trends: TrendChange[]; caveat: string; method: string }> {
  await enforce(principal, 'read', communityResource);
  const k = await getKThreshold();
  const { themes, links, latestKey } = await themeRows();
  const trends = themes.map((t): TrendChange => {
    const rows = links.filter((l) => l.themeId === t.id);
    const total = distinctOrgs(rows.map((r) => ({ sourceTenantId: r.org })));
    const recent = rows.filter((r) => latestKey !== null && quarterKey(r.period) === latestKey);
    const earlier = rows.filter((r) => latestKey !== null && (quarterKey(r.period) ?? Infinity) < latestKey);
    const rN = new Set(recent.map((r) => r.org)).size;
    const eN = new Set(earlier.map((r) => r.org)).size;
    const direction = trendDirection(total, rN, eN, k);
    const established = total >= k;
    return {
      themeId: t.id,
      name: t.name,
      direction,
      text:
        direction === 'insufficient'
          ? `${TREND_TEXT.insufficient} ${established ? `Comparing periods would isolate fewer than ${k} organisations.` : `Fewer than ${k} distinct organisations have contributed (emerging).`}`
          : TREND_TEXT[direction],
      orgBand: orgBand(total, k),
      latestPeriod: direction === 'insufficient' || latestKey === null ? null : quarterLabel(latestKey),
      comparedPeriod: direction === 'insufficient' || latestKey === null ? null : 'earlier periods',
      evidence: established ? rows.map((r) => ({ id: r.id, title: r.title, period: r.period })) : [],
      confidence:
        direction === 'insufficient'
          ? 'None — no trend statement is made.'
          : total < 2 * k
            ? 'Low — small, self-selected sample; based on distinct organisations per observation period.'
            : 'Moderate — based on distinct organisations per observation period, not volume of posts.',
      limitations: t.limitations || 'Self-selected contributions; not a market sample.',
    };
  });
  return {
    k,
    latestPeriod: latestKey === null ? null : quarterLabel(latestKey),
    trends,
    caveat: `${POPULARITY_CAVEAT} Directions compare distinct organisations between the latest observation period and earlier ones, and are shown only when each window has none or at least ${k} organisations.`,
    method: 'Deterministic rule over distinct organisations per observation period (no model).',
  };
}

export type PrioritisedTheme = {
  themeId: string;
  name: string;
  orgBand: string;
  latestPeriod: string | null;
  score: number;
  factors: PriorityFactor[];
  ideas: { id: string; title: string; status: string }[];
  evidence: { id: string; title: string; period: string | null }[];
};

/**
 * Assisted prioritisation for product owners. Transparent additive score; emerging themes (< k orgs) are listed
 * without scores, counts or evidence. No contributor or organisation leaderboards.
 */
export async function prioritisationAssist(principal: Principal | null): Promise<{ k: number; ranked: PrioritisedTheme[]; emerging: { themeId: string; name: string; reason: string }[]; weights: typeof PRIORITY_WEIGHTS; note: string }> {
  await enforce(principal, 'manage_idea', ownerResource);
  const k = await getKThreshold();
  const { themes, links, latestKey } = await themeRows();
  const { feedback, ideaLinks } = await withSystemTx(async (tx) => {
    // Aggregate counts per theme only: no per-user or per-organisation rows leave the database.
    const feedback = await tx
      .select({ themeId: schema.themeLinks.themeId, rating: schema.contributionFeedback.rating, n: sql<number>`count(*)::int` })
      .from(schema.contributionFeedback)
      .innerJoin(schema.themeLinks, eq(schema.themeLinks.sharedInsightId, schema.contributionFeedback.sharedInsightId))
      .innerJoin(schema.sharedInsights, eq(schema.sharedInsights.id, schema.contributionFeedback.sharedInsightId))
      .where(eq(schema.sharedInsights.status, 'published'))
      .groupBy(schema.themeLinks.themeId, schema.contributionFeedback.rating);
    const ideaLinks = await tx
      .select({ sharedInsightId: schema.ideaEvidence.sharedInsightId, id: schema.ideas.id, title: schema.ideas.title, status: schema.ideas.status })
      .from(schema.ideaEvidence)
      .innerJoin(schema.ideas, eq(schema.ideas.id, schema.ideaEvidence.ideaId));
    return { feedback, ideaLinks };
  });

  const ranked: PrioritisedTheme[] = [];
  const emerging: { themeId: string; name: string; reason: string }[] = [];
  for (const t of themes) {
    const rows = links.filter((l) => l.themeId === t.id);
    const n = distinctOrgs(rows.map((r) => ({ sourceTenantId: r.org })));
    const band = orgBand(n, k);
    if (!band) {
      emerging.push({ themeId: t.id, name: t.name, reason: `Emerging — fewer than ${k} distinct organisations; not scored.` });
      continue;
    }
    const keys = rows.map((r) => quarterKey(r.period)).filter((x): x is number => x !== null);
    const themeLatest = keys.length ? Math.max(...keys) : null;
    const quality = { strong: 0, moderate: 0, limited: 0, unknown: 0 };
    for (const r of rows) quality[(r.quality ?? 'unknown') as keyof typeof quality]++;
    const fb = feedback.filter((f) => f.themeId === t.id);
    const ideas = new Map<string, { id: string; title: string; status: string }>();
    for (const il of ideaLinks) if (rows.some((r) => r.id === il.sharedInsightId)) ideas.set(il.id, { id: il.id, title: il.title, status: il.status });
    const { total, factors } = priorityScore({
      band,
      quartersBehindLatest: themeLatest === null || latestKey === null ? null : latestKey - themeLatest,
      quality,
      feedback: { useful: fb.find((f) => f.rating === 'useful')?.n ?? 0, needsEvidence: fb.find((f) => f.rating === 'needs_evidence')?.n ?? 0 },
      hasIdea: ideas.size > 0,
    });
    ranked.push({
      themeId: t.id, name: t.name, orgBand: band, latestPeriod: themeLatest === null ? null : quarterLabel(themeLatest), score: total, factors,
      ideas: [...ideas.values()], evidence: rows.map((r) => ({ id: r.id, title: r.title, period: r.period })),
    });
  }
  ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return {
    k,
    ranked,
    emerging,
    weights: PRIORITY_WEIGHTS,
    note: `Assistive ranking — not a decision; popularity is not prevalence; a human owner sets priority. ${POPULARITY_CAVEAT}`,
  };
}
