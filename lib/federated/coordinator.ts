import { verifyUpdate } from './auth';
import { DIM, SCHEMA_VERSION, add, canonical, coordinateMedian, cosine, median, norm, round, scale, sha256 } from './model';
import { prng } from './rng';
import type { ParticipantRecord, RegistryEntry, RoundConfig, SignedUpdate } from './types';

/**
 * COORDINATOR — receives update objects only. It has no access to participant storage or the
 * client runtime (this file must not import ./client or node:fs; a unit test enforces that).
 */

export type CoordinatorInput = {
  roundNo: number;
  base: { version: string; weights: number[] };
  registry: RegistryEntry[];
  updates: SignedUpdate[];
  /** Participants the orchestrator invited but that failed / timed out. */
  dropped: { keyId: string; reason: string }[];
  config: RoundConfig;
};

export type CoordinatorResult = {
  status: 'completed' | 'aborted';
  abortReason?: string;
  records: ParticipantRecord[];
  /** New global weights (only when completed). */
  weights?: number[];
  aggregateNorm?: number;
  dpApplied: boolean;
  /** Raw (unclipped) deltas of authenticated updates, for local-model baselines in evaluation. */
  deltasByKey: Map<string, number[]>;
};

export function updateHash(u: SignedUpdate) {
  const { signature: _s, ...body } = u;
  return sha256(canonical(body)).slice(0, 16);
}

/** Per-update checks that need no cohort context. Returns rejection reasons (empty = passes). */
export function basicChecks(u: SignedUpdate, input: Pick<CoordinatorInput, 'roundNo' | 'base' | 'registry' | 'config'>): string[] {
  const reg = input.registry.find((r) => r.keyId === u.participantKeyId);
  if (!reg) return ['unauthenticated: unknown participant key'];
  if (!verifyUpdate(u)) return ['unauthenticated: signature mismatch'];
  if (reg.status !== 'enrolled') return ['not_enrolled: participant has withdrawn from the programme'];
  const reasons: string[] = [];
  if (u.roundNo !== input.roundNo) reasons.push(`wrong_round: update for round ${u.roundNo}`);
  if (u.schemaVersion !== SCHEMA_VERSION) reasons.push(`schema_mismatch: ${u.schemaVersion}`);
  if (!Array.isArray(u.delta) || u.delta.length !== DIM) reasons.push(`dimension_mismatch: expected ${DIM}`);
  else if (!u.delta.every((x) => typeof x === 'number' && Number.isFinite(x))) reasons.push('non_finite: update contains NaN/Infinity');
  if (u.baseModelVersion !== input.base.version) reasons.push(`stale_base: trained on ${u.baseModelVersion}, round base is ${input.base.version}`);
  if (!Number.isInteger(u.numExamples) || u.numExamples < input.config.minExamples || u.numExamples > 1_000_000) {
    reasons.push(`implausible_example_count: ${u.numExamples}`);
  }
  return reasons;
}

export function runCoordinator(input: CoordinatorInput): CoordinatorResult {
  const { config } = input;
  const label = (keyId: string) => input.registry.find((r) => r.keyId === keyId);
  const records: ParticipantRecord[] = [];
  const deltasByKey = new Map<string, number[]>();
  const candidates: { u: SignedUpdate; rec: ParticipantRecord }[] = [];
  const seen = new Set<string>();

  for (const d of input.dropped) {
    const reg = label(d.keyId);
    records.push({ participantId: reg?.participantId ?? null, keyId: d.keyId, label: reg?.label ?? 'Unknown', outcome: 'dropped', reasons: [d.reason] });
    seen.add(d.keyId);
  }

  for (const u of input.updates) {
    const reg = label(u.participantKeyId);
    const rec: ParticipantRecord = {
      participantId: reg?.participantId ?? null,
      keyId: String(u.participantKeyId),
      label: reg?.label ?? 'Unregistered sender',
      outcome: 'rejected',
      reasons: [],
      updateHash: updateHash(u),
    };
    records.push(rec);
    if (seen.has(u.participantKeyId) && reg) { rec.reasons = ['duplicate: one update per participant per round']; continue; }
    seen.add(u.participantKeyId);
    rec.reasons = basicChecks(u, input);
    if (Array.isArray(u.delta) && u.delta.length === DIM && u.delta.every(Number.isFinite)) rec.updateNorm = round(norm(u.delta));
    if (rec.reasons.length) continue;
    rec.numExamples = u.numExamples;
    rec.localMetrics = u.localMetrics;
    deltasByKey.set(u.participantKeyId, u.delta);
    candidates.push({ u, rec });
  }

  // Poisoning heuristics need a cohort reference: coordinate-wise median and median norm are robust to a minority of bad updates.
  let passing = candidates;
  if (candidates.length >= 3) {
    const ref = coordinateMedian(candidates.map((c) => c.u.delta));
    const medNorm = median(candidates.map((c) => norm(c.u.delta)));
    passing = [];
    for (const c of candidates) {
      const n = norm(c.u.delta);
      const cos = cosine(c.u.delta, ref);
      c.rec.cosineToMedian = round(cos);
      if (n > config.normOutlierFactor * medNorm) c.rec.reasons.push(`norm_outlier: ‖Δ‖=${round(n, 2)} > ${config.normOutlierFactor}× cohort median ${round(medNorm, 2)}`);
      // Direction check only for updates big enough to matter: tiny, near-converged honest updates are noisy and their influence is already ≤ ½ the median.
      if (n >= 0.5 * medNorm && cos < config.minCosine) c.rec.reasons.push(`direction_outlier: cosine to median update ${round(cos, 2)} < ${config.minCosine}`);
      if (c.rec.reasons.length === 0) passing.push(c);
    }
  } else {
    for (const c of candidates) c.rec.reasons.push('unverifiable: fewer than 3 updates to compare against');
    passing = [];
  }

  if (passing.length < config.minCohort) {
    for (const c of passing) c.rec.reasons.push('not_used: passed validation, but the round was aborted');
    return { status: 'aborted', abortReason: `minimum cohort not met: ${passing.length} accepted update(s), ${config.minCohort} required`, records, dpApplied: false, deltasByKey };
  }

  // Clip, then FedAvg weighted by capped example counts.
  const clipped = passing.map((c) => {
    const n = norm(c.u.delta);
    c.rec.clipped = n > config.clipNorm;
    return { c, d: c.rec.clipped ? scale(c.u.delta, config.clipNorm / n) : c.u.delta };
  });
  const raw = clipped.map(({ c }) => Math.min(c.u.numExamples, config.weightCap));
  const total = raw.reduce((s, x) => s + x, 0);
  let agg = new Array(DIM).fill(0);
  clipped.forEach(({ c, d }, i) => {
    const w = raw[i] / total;
    c.rec.outcome = 'accepted';
    c.rec.weight = round(w);
    agg = add(agg, scale(d, w));
  });

  // DP design sketch: Gaussian noise scaled to the largest single-participant influence (max weight × clip bound).
  let dpApplied = false;
  if (config.dpNoiseMultiplier > 0) {
    const sigma = config.dpNoiseMultiplier * config.clipNorm * Math.max(...raw.map((x) => x / total));
    const r = prng(`dp:${input.roundNo}`);
    agg = agg.map((x) => x + sigma * r.normal());
    dpApplied = true;
  }

  return { status: 'completed', records, weights: add(input.base.weights, agg), aggregateNorm: round(norm(agg)), dpApplied, deltasByKey };
}
