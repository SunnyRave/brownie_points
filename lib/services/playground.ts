import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { schema, withSystemTx, withTenantTx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { enforce } from '@/lib/policy/enforce';
import { isEmployee } from '@/lib/policy/authorize';
import { badRequest, notFound } from '@/lib/http';
import type { Principal } from '@/lib/policy/types';
import { scanSensitive } from '@/lib/scan';

export const SIMULATED_LABEL = 'Simulated · synthetic data · not a credit or business decision';

export type ScenarioField = { key: string; label: string; unit?: string; min: number; max: number; step: number };
export type Scenario = { id: string; offeringSlug: string; name: string; description: string; inputs: Record<string, number>; fields: ScenarioField[] };

const FAI_FIELDS: ScenarioField[] = [
  { key: 'annualRevenue', label: 'Annual revenue', unit: 'k', min: 100, max: 50000, step: 50 },
  { key: 'peakQuarterShare', label: 'Share of revenue in peak quarter', unit: '%', min: 25, max: 80, step: 1 },
  { key: 'q1Revenue', label: 'Latest quarter revenue', unit: 'k', min: 10, max: 20000, step: 10 },
  { key: 'currentAssets', label: 'Current assets', unit: 'k', min: 10, max: 30000, step: 10 },
  { key: 'currentLiabilities', label: 'Current liabilities', unit: 'k', min: 10, max: 30000, step: 10 },
  { key: 'ebitda', label: 'EBITDA (annual)', unit: 'k', min: -5000, max: 10000, step: 10 },
  { key: 'debtService', label: 'Annual debt service', unit: 'k', min: 1, max: 5000, step: 5 },
];

export const SCENARIOS: Scenario[] = [
  {
    id: 'seasonal-sme', offeringSlug: 'financial-analysis', name: 'Seasonal SME (garden supplies)',
    description: 'Synthetic retailer earning 55% of revenue in one quarter; latest quarter is the off-season.',
    inputs: { annualRevenue: 4200, peakQuarterShare: 55, q1Revenue: 480, currentAssets: 1350, currentLiabilities: 980, ebitda: 610, debtService: 300 }, fields: FAI_FIELDS,
  },
  {
    id: 'stable-retail', offeringSlug: 'financial-analysis', name: 'Stable retail chain',
    description: 'Synthetic multi-store retailer with even quarterly revenue.',
    inputs: { annualRevenue: 9800, peakQuarterShare: 27, q1Revenue: 2400, currentAssets: 3100, currentLiabilities: 1900, ebitda: 1250, debtService: 520 }, fields: FAI_FIELDS,
  },
  {
    id: 'distressed-manufacturer', offeringSlug: 'financial-analysis', name: 'Distressed manufacturer',
    description: 'Synthetic manufacturer with falling margins and tight liquidity.',
    inputs: { annualRevenue: 6100, peakQuarterShare: 26, q1Revenue: 1300, currentAssets: 1400, currentLiabilities: 2100, ebitda: 180, debtService: 450 }, fields: FAI_FIELDS,
  },
  {
    id: 'doc-pack', offeringSlug: 'document-intelligence', name: 'SME loan document pack',
    description: 'Synthetic document pack: count of pages extracted and fields matched.',
    inputs: { documents: 12, pagesExtracted: 58, fieldsExpected: 140, fieldsMatched: 121, lowConfidenceFields: 9 },
    fields: [
      { key: 'documents', label: 'Documents in pack', min: 1, max: 60, step: 1 },
      { key: 'pagesExtracted', label: 'Pages extracted', min: 1, max: 600, step: 1 },
      { key: 'fieldsExpected', label: 'Fields expected', min: 1, max: 500, step: 1 },
      { key: 'fieldsMatched', label: 'Fields matched', min: 0, max: 500, step: 1 },
      { key: 'lowConfidenceFields', label: 'Low-confidence fields', min: 0, max: 200, step: 1 },
    ],
  },
];

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Deterministic, explainable engine. Outputs are signals for discussion, never decisions. */
export function runEngine(scenario: Scenario, inputs: Record<string, number>) {
  if (scenario.offeringSlug === 'document-intelligence') {
    const coverage = inputs.fieldsMatched / inputs.fieldsExpected;
    const reviewLoad = inputs.lowConfidenceFields / Math.max(1, inputs.fieldsMatched);
    return {
      label: SIMULATED_LABEL,
      signal: coverage > 0.9 && reviewLoad < 0.05 ? 'Ready for human spot-check' : 'Needs human review',
      metrics: [
        { name: 'Field coverage', value: `${r2(coverage * 100)}%` },
        { name: 'Low-confidence share', value: `${r2(reviewLoad * 100)}%` },
        { name: 'Pages per document', value: r2(inputs.pagesExtracted / inputs.documents) },
      ],
      evidence: [
        `${inputs.fieldsMatched} of ${inputs.fieldsExpected} expected fields matched in the synthetic pack.`,
        `${inputs.lowConfidenceFields} fields fall below the illustrative confidence threshold and would be routed to a reviewer.`,
      ],
    };
  }
  const currentRatio = inputs.currentAssets / inputs.currentLiabilities;
  const dscr = inputs.ebitda / inputs.debtService;
  const evenQuarter = inputs.annualRevenue / 4;
  const naiveAnnualised = inputs.q1Revenue * 4;
  const seasonalityIndex = inputs.peakQuarterShare / 25; // 1.0 = perfectly even
  const offSeasonExpected = (inputs.annualRevenue * (100 - inputs.peakQuarterShare)) / 100 / 3;
  const seasonalGap = inputs.q1Revenue / offSeasonExpected;
  const naiveDecline = naiveAnnualised / inputs.annualRevenue - 1;
  const seasonal = seasonalityIndex >= 1.6;
  const stress = currentRatio < 1 || dscr < 1.1 || (!seasonal && naiveDecline < -0.25) || (seasonal && seasonalGap < 0.8);
  return {
    label: SIMULATED_LABEL,
    signal: stress ? 'Elevated attention suggested' : 'Within illustrative range',
    metrics: [
      { name: 'Current ratio', value: r2(currentRatio) },
      { name: 'Debt service coverage', value: r2(dscr) },
      { name: 'Seasonality index', value: r2(seasonalityIndex) },
      { name: 'Naive annualised change', value: `${r2(naiveDecline * 100)}%` },
      { name: 'Seasonality-aware gap', value: `${r2((seasonalGap - 1) * 100)}%` },
    ],
    evidence: [
      `Naive comparison annualises the latest quarter (${inputs.q1Revenue}k × 4 = ${naiveAnnualised}k) against ${inputs.annualRevenue}k, suggesting a ${r2(naiveDecline * 100)}% change.`,
      seasonal
        ? `With ${inputs.peakQuarterShare}% of revenue in the peak quarter, an off-season quarter is expected near ${r2(offSeasonExpected)}k; the latest quarter is ${r2((seasonalGap - 1) * 100)}% versus that baseline.`
        : `Revenue is close to even across quarters (even quarter ≈ ${r2(evenQuarter)}k), so the naive comparison is a reasonable baseline.`,
      `Liquidity: current ratio ${r2(currentRatio)}; coverage: EBITDA / debt service = ${r2(dscr)}.`,
    ],
  };
}

const runSchema = z.object({
  scenarioId: z.string().max(64),
  inputs: z.record(z.string().max(40), z.number().finite()),
});

async function offeringBySlug(slug: string) {
  const [o] = await withSystemTx((tx) => tx.select().from(schema.offerings).where(eq(schema.offerings.slug, slug)).limit(1));
  if (!o) throw notFound();
  return o;
}

export async function sandboxEntitlements(tenantId: string) {
  return withSystemTx(async (tx) =>
    (await tx.select({ offeringId: schema.entitlements.offeringId }).from(schema.entitlements).where(and(eq(schema.entitlements.orgId, tenantId), eq(schema.entitlements.sandboxEnabled, true)))).map((e) => e.offeringId),
  );
}

/** Context decides the gate: employee Playground vs. tenant sandbox with product entitlement (IAM-07, CLI-03). */
async function gate(principal: Principal | null, context: 'employee' | 'client', offeringId: string) {
  if (context === 'employee') {
    await enforce(principal, 'read', { type: 'playground', audience: { kind: 'employee' } });
    return null;
  }
  const tenantId = principal?.activeTenantId ?? null;
  const entitled = tenantId ? await sandboxEntitlements(tenantId) : [];
  await enforce(principal, 'read', { type: 'sandbox', audience: tenantId ? { kind: 'tenant', tenantId } : null, offeringId }, { entitledOfferingIds: entitled });
  return tenantId;
}

export async function runScenario(principal: Principal | null, context: 'employee' | 'client', raw: unknown) {
  const input = runSchema.parse(raw);
  const scenario = SCENARIOS.find((s) => s.id === input.scenarioId);
  if (!scenario) throw notFound();
  const offering = await offeringBySlug(scenario.offeringSlug);
  const tenantId = await gate(principal, context, offering.id);
  const inputs: Record<string, number> = {};
  for (const f of scenario.fields) {
    const v = input.inputs[f.key] ?? scenario.inputs[f.key];
    if (v < f.min || v > f.max) throw badRequest('input_out_of_range', `${f.label} must be between ${f.min} and ${f.max}`);
    inputs[f.key] = v;
  }
  const outputs = runEngine(scenario, inputs);
  const run = await withTenantTx(principal!.userId, tenantId, async (tx) => {
    const [row] = await tx.insert(schema.playgroundRuns).values({ userId: principal!.userId, tenantId, offeringId: offering.id, scenarioId: scenario.id, inputs, outputs }).returning();
    await audit(tx, { actorId: principal!.userId, action: 'sandbox.run', resourceType: 'playground_run', resourceId: row.id, tenantId, meta: { scenario: scenario.id } });
    return row;
  });
  return { runId: run.id, outputs };
}

const feedbackSchema = z.object({ useful: z.enum(['yes', 'partly', 'no']), clarity: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() });

export async function recordFeedback(principal: Principal | null, runId: string, raw: unknown) {
  const fb = feedbackSchema.parse(raw);
  if (!principal) await enforce(null, 'update', { type: 'playground_run', audience: { kind: 'employee' } });
  const tenantId = isEmployee(principal) && !principal!.activeTenantId ? null : principal!.activeTenantId;
  await withTenantTx(principal!.userId, tenantId, async (tx) => {
    // RLS: only the user's own runs in the current context are updatable.
    const updated = await tx.update(schema.playgroundRuns).set({ feedback: fb }).where(eq(schema.playgroundRuns.id, runId)).returning({ id: schema.playgroundRuns.id });
    if (!updated.length) throw notFound();
  });
}

export async function listRuns(principal: Principal | null, context: 'employee' | 'client') {
  if (context === 'employee') await enforce(principal, 'read', { type: 'playground', audience: { kind: 'employee' } });
  else await enforce(principal, 'read', { type: 'sandbox', audience: principal?.activeTenantId ? { kind: 'tenant', tenantId: principal.activeTenantId } : null });
  const tenantId = context === 'employee' ? null : principal!.activeTenantId;
  return withTenantTx(principal!.userId, tenantId, (tx) => tx.select().from(schema.playgroundRuns).orderBy(desc(schema.playgroundRuns.createdAt)).limit(10));
}

// ───────── Sandbox feedback for product owners (EMP feedback loop) ─────────

export type FeedbackComment = { source: 'Client' | 'Employee'; text: string | null; withheld: boolean; at: string };
export type ScenarioFeedback = {
  offeringName: string;
  scenarioId: string;
  scenarioName: string;
  responses: number;
  useful: { yes: number; partly: number; no: number };
  avgClarity: number | null;
  comments: FeedbackComment[];
};

const ownerResource = { type: 'sandbox_feedback', audience: { kind: 'grant' as const, grant: 'product_owner' as const } };

/**
 * Aggregated sandbox/Playground feedback per offering + scenario for product owners.
 * No user, organisation or run identifiers leave this function; comments that look sensitive are withheld.
 */
export async function sandboxFeedbackSummary(principal: Principal | null): Promise<ScenarioFeedback[]> {
  await enforce(principal, 'manage_idea', ownerResource);
  const rows = await withSystemTx((tx) =>
    tx
      .select({ offeringId: schema.playgroundRuns.offeringId, scenarioId: schema.playgroundRuns.scenarioId, tenantId: schema.playgroundRuns.tenantId, feedback: schema.playgroundRuns.feedback, createdAt: schema.playgroundRuns.createdAt })
      .from(schema.playgroundRuns)
      .where(isNotNull(schema.playgroundRuns.feedback))
      .orderBy(desc(schema.playgroundRuns.createdAt)),
  );
  const offerings = await withSystemTx((tx) => tx.select({ id: schema.offerings.id, name: schema.offerings.name }).from(schema.offerings));
  const offeringName = new Map(offerings.map((o) => [o.id, o.name]));
  const groups = new Map<string, ScenarioFeedback & { clarityTotal: number }>();
  for (const r of rows) {
    const fb = r.feedback as { useful?: 'yes' | 'partly' | 'no'; clarity?: number; comment?: string } | null;
    if (!fb) continue;
    const key = `${r.offeringId}:${r.scenarioId}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        offeringName: offeringName.get(r.offeringId) ?? 'Unknown offering', scenarioId: r.scenarioId,
        scenarioName: SCENARIOS.find((x) => x.id === r.scenarioId)?.name ?? r.scenarioId,
        responses: 0, useful: { yes: 0, partly: 0, no: 0 }, avgClarity: null, comments: [], clarityTotal: 0,
      };
      groups.set(key, g);
    }
    g.responses += 1;
    if (fb.useful) g.useful[fb.useful] += 1;
    if (typeof fb.clarity === 'number') g.clarityTotal += fb.clarity;
    const text = fb.comment?.trim();
    if (text && g.comments.length < 8) {
      const withheld = scanSensitive({ title: '', body: text }).length > 0;
      g.comments.push({ source: r.tenantId ? 'Client' : 'Employee', text: withheld ? null : text, withheld, at: r.createdAt.toISOString() });
    }
  }
  return [...groups.values()]
    .map(({ clarityTotal, ...g }) => ({ ...g, avgClarity: g.responses ? Math.round((clarityTotal / g.responses) * 10) / 10 : null }))
    .sort((a, b) => b.responses - a.responses);
}
