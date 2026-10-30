import { desc, eq, inArray } from 'drizzle-orm';
import { schema, withSystemTx } from '@/lib/db';
import { enforce } from '@/lib/policy/enforce';
import { getKThreshold } from '@/lib/settings';
import { notFound } from '@/lib/http';
import { toSharedInsightDTO, type SharedInsightDTO } from '@/lib/learning/dto';
import type { Principal } from '@/lib/policy/types';

type SharedRow = typeof schema.sharedInsights.$inferSelect;

export const communityResource = { type: 'shared_community', audience: { kind: 'shared_community' as const } };

/** Distinct contributing organisations. Five posts from one org count once. Tenant IDs never leave this module. */
export const distinctOrgs = (rows: Pick<SharedRow, 'sourceTenantId'>[]) => new Set(rows.map((r) => r.sourceTenantId)).size;

/** Counts shown only as bands, starting at k. */
export function orgBand(n: number, k: number): string | null {
  if (n < k) return null;
  if (n <= 5) return `${k}–5`;
  if (n <= 10) return '6–10';
  return '10+';
}

export const FILTER_DIMENSIONS = [
  { key: 'offering', column: 'offeringId', label: 'Offering' },
  { key: 'industry', column: 'industry', label: 'Industry' },
  { key: 'region', column: 'regionGeneralised', label: 'Region' },
  { key: 'period', column: 'periodQuarter', label: 'Observation period' },
  { key: 'topic', column: 'topic', label: 'Topic' },
] as const;
export type FilterKey = (typeof FILTER_DIMENSIONS)[number]['key'];
export type Filters = Partial<Record<FilterKey, string>>;

function matches(r: SharedRow, f: Filters) {
  return FILTER_DIMENSIONS.every((d) => !f[d.key] || (r[d.column] ?? '') === f[d.key]);
}

/**
 * INS-03: a filter slice is allowed only if it covers ≥ k organisations AND its complement is either
 * empty or also ≥ k organisations — otherwise comparing filtered vs. unfiltered views isolates < k orgs.
 */
export function sliceCheck(all: SharedRow[], f: Filters, k: number): { ok: boolean; reason?: string } {
  if (!Object.values(f).some(Boolean)) return { ok: true };
  const slice = all.filter((r) => matches(r, f));
  const complement = all.filter((r) => !matches(r, f));
  const s = distinctOrgs(slice);
  const c = distinctOrgs(complement);
  if (s < k) return { ok: false, reason: `Fewer than ${k} organisations in this slice` };
  if (c > 0 && c < k) return { ok: false, reason: `Would isolate fewer than ${k} organisations by comparison` };
  return { ok: true };
}

async function loadPublished() {
  return withSystemTx((tx) => tx.select().from(schema.sharedInsights).where(eq(schema.sharedInsights.status, 'published')).orderBy(desc(schema.sharedInsights.publishedAt)));
}

export type FacetOption = { value: string; label: string; disabled: boolean; reason?: string };

export async function communityFeed(principal: Principal | null, requested: Filters) {
  await enforce(principal, 'read', communityResource);
  const k = await getKThreshold();
  const all = await loadPublished();
  const offerings = await withSystemTx((tx) => tx.select({ id: schema.offerings.id, name: schema.offerings.name }).from(schema.offerings));
  const offeringName = new Map(offerings.map((o) => [o.id, o.name]));

  // Server enforces the same rule the UI shows: disallowed filters are dropped, never applied.
  const applied: Filters = {};
  const rejected: FilterKey[] = [];
  for (const d of FILTER_DIMENSIONS) {
    const v = requested[d.key];
    if (!v) continue;
    if (sliceCheck(all, { ...applied, [d.key]: v }, k).ok) applied[d.key] = v;
    else rejected.push(d.key);
  }
  const items = all.filter((r) => matches(r, applied));

  const facets = FILTER_DIMENSIONS.map((d) => {
    const values = [...new Set(all.map((r) => r[d.column]).filter((v): v is string => !!v))].sort();
    const options: FacetOption[] = values.map((value) => {
      const check = sliceCheck(all, { ...applied, [d.key]: value }, k);
      return { value, label: d.key === 'offering' ? offeringName.get(value) ?? value : value, disabled: !check.ok, reason: check.reason };
    });
    return { key: d.key, label: d.label, options };
  });

  const results = items.map(toSharedInsightDTO);
  // AT-15: count is derived from exactly the visible list.
  return { results, count: results.length, facets, applied, rejected, k };
}

export async function getSharedInsight(principal: Principal | null, id: string): Promise<SharedInsightDTO> {
  await enforce(principal, 'read', { ...communityResource, id });
  const [row] = await withSystemTx((tx) => tx.select().from(schema.sharedInsights).where(eq(schema.sharedInsights.id, id)).limit(1));
  if (!row || row.status !== 'published') throw notFound();
  return toSharedInsightDTO(row);
}

export type ThemeView = {
  id: string;
  name: string;
  summary: string;
  offerings: string[];
  limitations: string;
  updatedAt: string;
  emerging: boolean;
  orgBand: string | null;
  period: string | null;
  smallSample: boolean;
  evidence: SharedInsightDTO[];
  ideas: { id: string; title: string; status: string }[];
};

/**
 * INS-01/02: below k distinct orgs a theme is "Emerging" with no counts and no evidence breakdown.
 * Popularity is never presented as prevalence; every theme carries limitations + a small-sample warning.
 */
export async function themeDashboard(principal: Principal | null): Promise<{ themes: ThemeView[]; k: number }> {
  await enforce(principal, 'read', communityResource);
  const k = await getKThreshold();
  return withSystemTx(async (tx) => {
    const themes = await tx.select().from(schema.themes).orderBy(desc(schema.themes.updatedAt));
    const links = await tx
      .select({ themeId: schema.themeLinks.themeId, shared: schema.sharedInsights })
      .from(schema.themeLinks)
      .innerJoin(schema.sharedInsights, eq(schema.sharedInsights.id, schema.themeLinks.sharedInsightId))
      .where(eq(schema.sharedInsights.status, 'published'));
    const offerings = await tx.select({ id: schema.offerings.id, name: schema.offerings.name }).from(schema.offerings);
    const offeringName = new Map(offerings.map((o) => [o.id, o.name]));
    const ideaLinks = await tx
      .select({ sharedInsightId: schema.ideaEvidence.sharedInsightId, id: schema.ideas.id, title: schema.ideas.title, status: schema.ideas.status })
      .from(schema.ideaEvidence)
      .innerJoin(schema.ideas, eq(schema.ideas.id, schema.ideaEvidence.ideaId));
    return {
      k,
      themes: themes.map((t) => {
        const rows = links.filter((l) => l.themeId === t.id).map((l) => l.shared);
        const n = distinctOrgs(rows);
        const emerging = n < k;
        const quarters = rows.map((r) => r.periodQuarter).filter(Boolean).sort() as string[];
        const ideaMap = new Map<string, { id: string; title: string; status: string }>();
        if (!emerging) for (const il of ideaLinks) if (rows.some((r) => r.id === il.sharedInsightId)) ideaMap.set(il.id, { id: il.id, title: il.title, status: il.status });
        return {
          id: t.id,
          name: t.name,
          summary: t.summary,
          offerings: t.offeringIds.map((o) => offeringName.get(o) ?? o),
          limitations: t.limitations,
          updatedAt: t.updatedAt.toISOString(),
          emerging,
          orgBand: orgBand(n, k),
          period: emerging || quarters.length === 0 ? null : quarters[0] === quarters[quarters.length - 1] ? quarters[0] : `${quarters[0]} – ${quarters[quarters.length - 1]}`,
          smallSample: n < k * 2,
          evidence: emerging ? [] : rows.map(toSharedInsightDTO),
          ideas: [...ideaMap.values()],
        };
      }),
    };
  });
}

export async function getPublishedByIds(ids: string[]) {
  if (!ids.length) return [];
  return withSystemTx((tx) => tx.select().from(schema.sharedInsights).where(inArray(schema.sharedInsights.id, ids)));
}

/**
 * Homepage preview for anonymous visitors: established themes only (≥ k distinct orgs), as aggregates —
 * name, moderator-written summary, offerings, org band, period and limitations. No evidence, no ideas,
 * and emerging themes are reported only as a count.
 */
export async function publicThemePreview() {
  const k = await getKThreshold();
  return withSystemTx(async (tx) => {
    const themes = await tx.select().from(schema.themes);
    const links = await tx
      .select({ themeId: schema.themeLinks.themeId, tenant: schema.sharedInsights.sourceTenantId, quarter: schema.sharedInsights.periodQuarter })
      .from(schema.themeLinks)
      .innerJoin(schema.sharedInsights, eq(schema.sharedInsights.id, schema.themeLinks.sharedInsightId))
      .where(eq(schema.sharedInsights.status, 'published'));
    const offerings = await tx.select({ id: schema.offerings.id, name: schema.offerings.name }).from(schema.offerings);
    const name = new Map(offerings.map((o) => [o.id, o.name]));
    const views = themes.map((t) => {
      const rows = links.filter((l) => l.themeId === t.id);
      const n = new Set(rows.map((r) => r.tenant)).size;
      const q = rows.map((r) => r.quarter).filter(Boolean).sort() as string[];
      return {
        id: t.id, name: t.name, summary: t.summary, offerings: t.offeringIds.map((o) => name.get(o) ?? o), limitations: t.limitations,
        updatedAt: t.updatedAt.toISOString(), emerging: n < k, orgBand: orgBand(n, k), smallSample: n < k * 2,
        period: q.length ? (q[0] === q[q.length - 1] ? q[0] : `${q[0]} – ${q[q.length - 1]}`) : null,
      };
    });
    return { k, established: views.filter((v) => !v.emerging), emergingCount: views.filter((v) => v.emerging).length };
  });
}
