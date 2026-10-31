import { FEATURES, sigmoid, type Example } from './model';
import { prng } from './rng';

/**
 * Synthetic data generator. Used ONLY by the client runtime (to materialise a participant's local
 * training file) and by the coordinator's evaluator (for the independent holdout). Never by the aggregator.
 */

/** Ground truth in standardised space: bias + one coefficient per feature, plus one interaction term. */
const TRUE_BIAS = -0.6;
const TRUE_COEF = [1.3, 0.6, -1.4, -0.8, -1.0, 0.9];
const INTERACTION = 0.5; // revenue_volatility × sector_risk — the linear model cannot fit this exactly

/** Per-participant skew: covariate shift (means/spread), label-policy shift (intercept) and size. */
export type SkewProfile = { shift: number[]; spread: number[]; labelOffset: number; size: number };

export function profileFor(keyId: string): SkewProfile {
  const r = prng(`profile:${keyId}`);
  return {
    shift: FEATURES.map(() => round2((r.next() * 2 - 1) * 0.9)),
    spread: FEATURES.map(() => round2(0.55 + r.next() * 0.6)),
    labelOffset: round2((r.next() * 2 - 1) * 1.3),
    size: 160 + Math.floor(r.next() * 740),
  };
}

const HOLDOUT_PROFILE: SkewProfile = { shift: FEATURES.map(() => 0), spread: FEATURES.map(() => 1), labelOffset: 0, size: 2000 };

function generate(seed: string, p: SkewProfile): Example[] {
  const r = prng(seed);
  const out: Example[] = [];
  for (let i = 0; i < p.size; i++) {
    const raw = FEATURES.map((spec, j) => {
      const z = p.shift[j] + p.spread[j] * r.normal();
      return Math.min(spec.max, Math.max(spec.min, spec.mean + spec.sd * z));
    });
    const z = raw.map((x, j) => (x - FEATURES[j].mean) / FEATURES[j].sd);
    let logit = TRUE_BIAS + p.labelOffset + INTERACTION * z[0] * z[5];
    for (let j = 0; j < z.length; j++) logit += TRUE_COEF[j] * z[j];
    out.push({ f: raw.map((x) => Math.round(x * 1e4) / 1e4), y: r.next() < sigmoid(logit) ? 1 : 0 });
  }
  return out;
}

export const generateParticipantDataset = (keyId: string) => generate(`train:${keyId}`, profileFor(keyId));

/** Independent global holdout: unshifted population, its own seed, never derived from any participant. */
export const HOLDOUT_VERSION = 'holdout-v1';
export const generateHoldout = () => generate(`holdout:${HOLDOUT_VERSION}`, HOLDOUT_PROFILE);

const round2 = (x: number) => Math.round(x * 100) / 100;
