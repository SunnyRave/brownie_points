import { HOLDOUT_VERSION, generateHoldout } from './data';
import { add, metricsFor, predict, round, standardise, type Metrics } from './model';

/**
 * Global evaluation on the coordinator's own synthetic holdout. The holdout is generated independently
 * of every participant (own seed, unshifted population) and never leaves the evaluator.
 */
let cache: { z: number[][]; y: number[] } | null = null;
function holdout() {
  if (!cache) {
    const rows = generateHoldout();
    cache = { z: rows.map((r) => standardise(r.f)), y: rows.map((r) => r.y) };
  }
  return cache;
}

export function evaluate(weights: number[]): Metrics {
  const h = holdout();
  return metricsFor(h.z.map((z) => predict(weights, z)), h.y);
}

export function holdoutInfo() {
  const h = holdout();
  const pos = h.y.reduce((s, y) => s + y, 0) / h.y.length;
  return { version: HOLDOUT_VERSION, examples: h.y.length, positiveRate: round(pos) };
}

/** Majority-class baseline: always predicts the holdout majority class with a constant 0.5 score. */
export function majorityBaseline(): Metrics {
  const { positiveRate } = holdoutInfo();
  return { accuracy: round(Math.max(positiveRate, 1 - positiveRate)), logLoss: round(Math.log(2)), auc: 0.5 };
}

export type LocalBaseline = { label: string; metrics: Metrics; valAccuracy?: number; outcome: string };

/** Each participant's own model (round base + its unclipped update) scored on the same holdout. */
export function localBaselines(base: number[], entries: { label: string; delta: number[]; valAccuracy?: number; outcome: string }[]): LocalBaseline[] {
  return entries.map((e) => ({ label: e.label, outcome: e.outcome, valAccuracy: e.valAccuracy, metrics: evaluate(add(base, e.delta)) }));
}

/** Plain-language explanation of how client skew showed up in this round, computed from the numbers. */
export function skewNote(global: Metrics, locals: LocalBaseline[], fromScratch: boolean): string {
  const kind = fromScratch ? 'Local-only models' : 'Single-participant models (round base + only that participant’s update)';
  const honest = locals.filter((l) => l.outcome === 'accepted');
  if (!honest.length) return 'No accepted participants — no skew comparison possible.';
  const accs = honest.map((l) => l.metrics.accuracy);
  const worst = honest.reduce((a, b) => (a.metrics.accuracy <= b.metrics.accuracy ? a : b));
  const gaps = honest.filter((l) => l.valAccuracy !== undefined).map((l) => ({ l, gap: (l.valAccuracy ?? 0) - l.metrics.accuracy }));
  const biggest = gaps.sort((a, b) => b.gap - a.gap)[0];
  const beats = honest.filter((l) => global.accuracy >= l.metrics.accuracy).length;
  const parts = [
    `${kind} scored ${pct(Math.min(...accs))}–${pct(Math.max(...accs))} accuracy on the shared holdout (global ${pct(global.accuracy)}); the aggregate matched or beat ${beats} of ${honest.length}.`,
    `Weakest: ${worst.label} (${pct(worst.metrics.accuracy)}, log-loss ${worst.metrics.logLoss}).`,
  ];
  if (biggest && biggest.gap > 0.01) {
    parts.push(`${biggest.l.label} looks ${pct(biggest.l.valAccuracy!)} accurate on its own validation split but ${pct(biggest.l.metrics.accuracy)} on the holdout — its local population (feature ranges, review policy) differs from the overall population.`);
  }
  parts.push('Skew pulls the average toward large or atypical participants: example-count weighting is capped, and the review-rate (intercept) differences between clients are averaged, not reconciled.');
  return parts.join(' ');
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
