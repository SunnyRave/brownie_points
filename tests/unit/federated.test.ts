import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.FL_STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-unit-'));

const { participantSecret, signUpdate } = await import('@/lib/federated/auth');
const { runCoordinator } = await import('@/lib/federated/coordinator');
const { simulateRound } = await import('@/lib/federated/round');
const { runLocalTraining, loadLocalDataset } = await import('@/lib/federated/client');
const { generateHoldout, generateParticipantDataset, profileFor } = await import('@/lib/federated/data');
const { evaluate, majorityBaseline } = await import('@/lib/federated/evaluate');
const { DIM, SCHEMA_VERSION, auc, metricsFor, norm } = await import('@/lib/federated/model');
const { DEFAULT_CONFIG } = await import('@/lib/federated/types');
type RegistryEntry = import('@/lib/federated/types').RegistryEntry;
type ModelUpdate = import('@/lib/federated/types').ModelUpdate;

const keys = ['flk_aaaa000001', 'flk_bbbb000002', 'flk_cccc000003', 'flk_dddd000004', 'flk_eeee000005'];
const reg = (n = 4, withdrawn: string[] = []): RegistryEntry[] =>
  keys.slice(0, n).map((k) => ({ participantId: `p-${k}`, keyId: k, label: `P-${k.slice(4, 8)}`, status: withdrawn.includes(k) ? 'withdrawn' : 'enrolled' }));
const base = { version: 'fl-v0', weights: new Array(DIM).fill(0) };
const quiet = { ...DEFAULT_CONFIG, scenarios: { dropout: false, poison: false, forged: false } };

function upd(keyId: string, delta: number[], numExamples: number, over: Partial<ModelUpdate> = {}) {
  return signUpdate(participantSecret(keyId), {
    participantKeyId: keyId, roundNo: 1, schemaVersion: SCHEMA_VERSION, baseModelVersion: 'fl-v0', delta, numExamples,
    localMetrics: { valExamples: 10, valAccuracy: 0.8, valLogLoss: 0.4 }, ...over,
  });
}
const v = (...xs: number[]) => [...xs, ...new Array(DIM - xs.length).fill(0)];
const coord = (updates: ReturnType<typeof upd>[], over: Partial<typeof quiet> = {}, registry = reg()) =>
  runCoordinator({ roundNo: 1, base, registry, updates, dropped: [], config: { ...quiet, ...over } });

describe('federated coordinator', () => {
  it('FedAvg weights by example count, capped', () => {
    const r = coord([upd(keys[0], v(1), 100), upd(keys[1], v(1.2), 300), upd(keys[2], v(0.8), 2000)], { weightCap: 600 });
    expect(r.status).toBe('completed');
    // weights 100:300:600 (2000 capped at 600)
    expect(r.weights![0]).toBeCloseTo((1 * 100 + 1.2 * 300 + 0.8 * 600) / 1000, 6);
    const w = r.records.map((x) => x.weight);
    expect(w).toEqual([0.1, 0.3, 0.6]);
  });

  it('clips every accepted update to the L2 bound', () => {
    const r = coord([upd(keys[0], v(3, 4), 100), upd(keys[1], v(3, 4), 100), upd(keys[2], v(6, 8), 100)], { clipNorm: 5 });
    expect(r.status).toBe('completed');
    expect(r.records[2].clipped).toBe(true);
    expect(r.records[0].clipped).toBe(false);
    expect(norm(r.weights!)).toBeLessThanOrEqual(5 + 1e-9);
  });

  it('rejects a poisoned (flipped, amplified) update with a recorded reason', () => {
    const honest = [v(1, 0.5, -0.3), v(0.9, 0.6, -0.2), v(1.1, 0.4, -0.4)];
    const r = coord([...honest.map((d, i) => upd(keys[i], d, 200)), upd(keys[3], v(-8, -4, 2.4), 200)]);
    expect(r.status).toBe('completed');
    const bad = r.records.find((x) => x.keyId === keys[3])!;
    expect(bad.outcome).toBe('rejected');
    expect(bad.reasons.join(' ')).toMatch(/norm_outlier|direction_outlier/);
    expect(r.weights![0]).toBeGreaterThan(0);
  });

  it('rejects unauthenticated, tampered, withdrawn, stale and malformed updates', () => {
    const good = [0, 1, 2].map((i) => upd(keys[i], v(1), 200));
    const forged = signUpdate('guess', { ...good[0], participantKeyId: 'flk_zzzz999999' });
    const tampered = { ...upd(keys[3], v(1), 200), numExamples: 99999 };
    const r1 = coord([...good, forged, tampered]);
    expect(r1.records.find((x) => x.keyId === 'flk_zzzz999999')!.reasons[0]).toMatch(/unauthenticated/);
    expect(r1.records.find((x) => x.keyId === keys[3])!.reasons[0]).toMatch(/signature mismatch/);

    const r2 = coord([...good, upd(keys[3], v(1), 200)], {}, reg(4, [keys[3]]));
    expect(r2.records.find((x) => x.keyId === keys[3])!.reasons[0]).toMatch(/not_enrolled/);

    const r3 = coord([
      upd(keys[0], v(1), 200, { baseModelVersion: 'fl-v9' }),
      upd(keys[1], [1, 2], 200),
      upd(keys[2], v(NaN), 200),
      upd(keys[3], v(1), 200, { schemaVersion: 'other/9' }),
    ]);
    const reasons = r3.records.map((x) => x.reasons.join(' '));
    expect(reasons[0]).toMatch(/stale_base/);
    expect(reasons[1]).toMatch(/dimension_mismatch/);
    expect(reasons[2]).toMatch(/non_finite/);
    expect(reasons[3]).toMatch(/schema_mismatch/);
    expect(r3.status).toBe('aborted');
  });

  it('aborts below the minimum cohort and registers nothing', () => {
    const r = coord([upd(keys[0], v(1), 200), upd(keys[1], v(1), 200)]);
    expect(r.status).toBe('aborted');
    expect(r.weights).toBeUndefined();
    expect(r.abortReason).toMatch(/minimum cohort/);
  });

  it('the coordinator module never imports participant data loading or the filesystem', () => {
    const src = fs.readFileSync(path.resolve('lib/federated/coordinator.ts'), 'utf8');
    const imports = src.split('\n').filter((l) => l.startsWith('import '));
    expect(imports.length).toBeGreaterThan(0);
    for (const l of imports) expect(l).not.toMatch(/'\.\/client'|'\.\/data'|'\.\/evaluate'|node:fs|node:path/);
  });
});

describe('federated rounds (simulated client environments)', () => {
  it('handles a dropped participant and still completes with ≥3 accepted', async () => {
    const o = await simulateRound({ roundNo: 1, base, registry: reg(4), config: { ...quiet, scenarios: { dropout: true, poison: false, forged: false } } });
    expect(o.status).toBe('completed');
    expect(o.records.filter((r) => r.outcome === 'dropped')).toHaveLength(1);
    expect(o.records.find((r) => r.outcome === 'dropped')!.simulated).toBe('dropout');
  });

  it('dropout + poisoning with 4 participants aborts on minimum cohort', async () => {
    const o = await simulateRound({ roundNo: 2, base, registry: reg(4), config: DEFAULT_CONFIG });
    expect(o.status).toBe('aborted');
    expect(o.records.find((r) => r.simulated === 'poisoned')!.outcome).toBe('rejected');
    expect(o.records.find((r) => r.simulated === 'forged')!.reasons[0]).toMatch(/unauthenticated/);
  });

  it('with 5 participants, all scenarios on: poisoned + forged rejected, dropout recorded, model produced', async () => {
    const o = await simulateRound({ roundNo: 1, base, registry: reg(5), config: DEFAULT_CONFIG });
    expect(o.status).toBe('completed');
    expect(o.records.filter((r) => r.outcome === 'accepted')).toHaveLength(3);
    expect(o.records.find((r) => r.simulated === 'poisoned')!.outcome).toBe('rejected');
  });

  it('global model beats the majority-class baseline and the untrained model on the separate holdout', async () => {
    const o = await simulateRound({ roundNo: 1, base, registry: reg(5), config: quiet });
    const g = o.metrics.global as { accuracy: number; logLoss: number; auc: number };
    const maj = majorityBaseline();
    expect(g.accuracy).toBeGreaterThan(maj.accuracy + 0.05);
    expect(g.logLoss).toBeLessThan(maj.logLoss);
    expect(g.auc).toBeGreaterThan(0.75);
    expect(typeof o.metrics.skewNote).toBe('string');
  });

  it('updates carry model numbers only — no examples', async () => {
    const u = await runLocalTraining({ keyId: keys[0], secret: participantSecret(keys[0]), roundNo: 1, base, epochs: 5, lr: 0.5, l2: 0 });
    expect(Object.keys(u).sort()).toEqual(['baseModelVersion', 'delta', 'localMetrics', 'numExamples', 'participantKeyId', 'roundNo', 'schemaVersion', 'signature']);
    expect(JSON.stringify(u).length).toBeLessThan(600);
    const local = loadLocalDataset(keys[0]);
    expect(JSON.stringify(u)).not.toContain(JSON.stringify(local[0].f));
    expect(fs.existsSync(path.join(process.env.FL_STORAGE_DIR!, keys[0], 'train.json'))).toBe(true);
  });
});

describe('federated data + metrics', () => {
  it('participant datasets are deterministic, skewed, and independent of the holdout', () => {
    expect(generateParticipantDataset(keys[0])).toEqual(generateParticipantDataset(keys[0]));
    const a = profileFor(keys[0]);
    const b = profileFor(keys[1]);
    expect(a).not.toEqual(b);
    expect(a.size).not.toBe(b.size);
    const h = generateHoldout();
    expect(h).toHaveLength(2000);
    const own = new Set(generateParticipantDataset(keys[0]).map((r) => JSON.stringify(r.f)));
    expect(h.some((r) => own.has(JSON.stringify(r.f)))).toBe(false);
  });

  it('metrics are sane', () => {
    expect(auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])).toBe(1);
    expect(auc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1])).toBe(0);
    expect(auc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1])).toBe(0.5);
    const m = metricsFor([0.9, 0.1], [1, 0]);
    expect(m.accuracy).toBe(1);
    expect(m.logLoss).toBeCloseTo(-Math.log(0.9), 3);
    const untrained = evaluate(new Array(DIM).fill(0));
    expect(untrained.auc).toBe(0.5);
    expect(untrained.logLoss).toBeCloseTo(Math.log(2), 3);
  });
});
