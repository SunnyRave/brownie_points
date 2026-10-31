import { createHash } from 'node:crypto';

/**
 * Programme contract shared by every participant and the coordinator (no data, no I/O).
 * Task: binary logistic regression — "does this synthetic SME application need human credit review?"
 */
export const SCHEMA_VERSION = 'sme-review/1.0';

/** Feature order is part of the contract. Raw values are standardised locally with these agreed constants. */
export const FEATURES = [
  { key: 'revenue_volatility', description: 'Coefficient of variation of monthly revenue', mean: 0.35, sd: 0.2, min: 0, max: 1.5 },
  { key: 'seasonality_index', description: 'Share of revenue in the peak quarter, rescaled 0–1', mean: 0.4, sd: 0.2, min: 0, max: 1 },
  { key: 'debt_service_coverage', description: 'Debt-service coverage ratio (DSCR)', mean: 1.4, sd: 0.5, min: 0, max: 4 },
  { key: 'log_months_trading', description: 'ln(1 + months trading)', mean: 3.6, sd: 0.9, min: 0, max: 6.5 },
  { key: 'document_completeness', description: 'Fraction of required documents supplied', mean: 0.8, sd: 0.15, min: 0, max: 1 },
  { key: 'sector_risk', description: 'Programme-agreed sector risk score 0–1', mean: 0.5, sd: 0.2, min: 0, max: 1 },
] as const;

export const FEATURE_KEYS = FEATURES.map((f) => f.key) as string[];
/** Weight vector = [bias, ...one weight per feature]. */
export const DIM = FEATURES.length + 1;

export const COMPATIBILITY = [
  `Every participant uses schema ${SCHEMA_VERSION}: same ${FEATURES.length} features, same order, same units.`,
  'Raw features are standardised locally with the programme constants (mean/sd above), never with local statistics, so weights mean the same thing everywhere.',
  'Label definition is shared: 1 = the case was routed to human credit review.',
  'Updates are deltas against the exact base model version the coordinator announced; a different base or dimension is rejected.',
  'Model family is fixed (logistic regression, bias + 6 weights); there is no per-client architecture.',
];

export type Example = { f: number[]; y: 0 | 1 };

export const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

export function standardise(raw: number[]): number[] {
  return FEATURES.map((spec, j) => (raw[j] - spec.mean) / spec.sd);
}

export function predict(w: number[], z: number[]): number {
  let s = w[0];
  for (let j = 0; j < z.length; j++) s += w[j + 1] * z[j];
  return sigmoid(s);
}

/** Full-batch gradient descent with L2. Starts from `init` (the announced global model). */
export function train(examples: { z: number[]; y: number }[], init: number[], opts: { epochs: number; lr: number; l2: number }): number[] {
  const w = init.slice();
  const n = examples.length;
  for (let e = 0; e < opts.epochs; e++) {
    const g = new Array(DIM).fill(0);
    for (const ex of examples) {
      const err = predict(w, ex.z) - ex.y;
      g[0] += err;
      for (let j = 0; j < ex.z.length; j++) g[j + 1] += err * ex.z[j];
    }
    for (let j = 0; j < DIM; j++) w[j] -= opts.lr * (g[j] / n + (j > 0 ? opts.l2 * w[j] : 0));
  }
  return w;
}

export type Metrics = { accuracy: number; logLoss: number; auc: number };

export function metricsFor(probs: number[], labels: number[]): Metrics {
  const eps = 1e-7;
  let correct = 0;
  let ll = 0;
  for (let i = 0; i < probs.length; i++) {
    const p = Math.min(1 - eps, Math.max(eps, probs[i]));
    if ((p >= 0.5 ? 1 : 0) === labels[i]) correct++;
    ll -= labels[i] ? Math.log(p) : Math.log(1 - p);
  }
  return { accuracy: round(correct / probs.length), logLoss: round(ll / probs.length), auc: round(auc(probs, labels)) };
}

/** Mann–Whitney AUC with average ranks for ties. */
export function auc(probs: number[], labels: number[]): number {
  const idx = probs.map((p, i) => [p, labels[i]] as const).sort((a, b) => a[0] - b[0]);
  let pos = 0;
  let rankSum = 0;
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (idx[k][1]) { pos++; rankSum += avg; }
    i = j + 1;
  }
  const neg = idx.length - pos;
  if (!pos || !neg) return 0.5;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

export const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
export const add = (a: number[], b: number[]) => a.map((x, i) => x + b[i]);
export const scale = (a: number[], k: number) => a.map((x) => x * k);
export function cosine(a: number[], b: number[]) {
  const d = norm(a) * norm(b);
  return d === 0 ? 0 : a.reduce((s, x, i) => s + x * b[i], 0) / d;
}
export function coordinateMedian(vs: number[][]): number[] {
  return vs[0].map((_, j) => {
    const col = vs.map((v) => v[j]).sort((a, b) => a - b);
    const m = Math.floor(col.length / 2);
    return col.length % 2 ? col[m] : (col[m - 1] + col[m]) / 2;
  });
}
export function median(xs: number[]) {
  return coordinateMedian(xs.map((x) => [x]))[0];
}

export const round = (x: number, dp = 4) => Math.round(x * 10 ** dp) / 10 ** dp;

/** Deterministic JSON (sorted keys) used for signatures and update hashes. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
