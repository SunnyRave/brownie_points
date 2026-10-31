import { participantSecret, signUpdate } from './auth';
import { runLocalTraining } from './client';
import { runCoordinator, type CoordinatorResult } from './coordinator';
import { evaluate, holdoutInfo, localBaselines, majorityBaseline, skewNote } from './evaluate';
import { DIM, SCHEMA_VERSION, round } from './model';
import type { ParticipantRecord, RegistryEntry, RoundConfig, SignedUpdate } from './types';

/**
 * Simulation harness = the "transport" between separate client environments and the coordinator.
 * Each enrolled participant's runtime is invoked independently; only the returned update objects
 * (or a failure) reach the coordinator. Fault scenarios are injected here and tagged in the log.
 */
export type RoundOutcome = {
  status: 'completed' | 'aborted';
  abortReason?: string;
  weights?: number[];
  records: ParticipantRecord[];
  metrics: Record<string, unknown>;
  coordinator: CoordinatorResult;
};

export async function simulateRound(input: {
  roundNo: number;
  base: { version: string; weights: number[] };
  registry: RegistryEntry[];
  config: RoundConfig;
}): Promise<RoundOutcome> {
  const { roundNo, base, registry, config } = input;
  const invited = registry.filter((r) => r.status === 'enrolled');
  const n = invited.length;
  // Rotate which participant suffers each simulated fault so different clients are exercised across rounds.
  const dropKey = config.scenarios.dropout && n ? invited[roundNo % n].keyId : null;
  const poisonKey = config.scenarios.poison && n > 1 ? invited[(roundNo + 1) % n].keyId : null;

  const updates: SignedUpdate[] = [];
  const dropped: { keyId: string; reason: string }[] = [];
  const tags = new Map<string, ParticipantRecord['simulated']>();

  await Promise.all(
    invited.map(async (p) => {
      try {
        const job = runLocalTraining({
          keyId: p.keyId,
          secret: participantSecret(p.keyId),
          roundNo,
          base,
          epochs: config.localEpochs,
          lr: config.learningRate,
          l2: config.l2,
          fault: p.keyId === poisonKey ? 'poison' : undefined,
        });
        if (p.keyId === poisonKey) tags.set(p.keyId, 'poisoned');
        if (p.keyId === dropKey) {
          tags.set(p.keyId, 'dropout');
          await job.catch(() => null);
          throw new Error(`timeout: no update within ${config.timeoutMs} ms (simulated client outage)`);
        }
        updates.push(await withTimeout(job, config.timeoutMs));
      } catch (e) {
        dropped.push({ keyId: p.keyId, reason: e instanceof Error ? e.message : 'client job failed' });
      }
    }),
  );

  if (config.scenarios.forged) {
    // An outside party injects an update under an unregistered key with a guessed secret.
    const forged = signUpdate('not-a-provisioned-secret', {
      participantKeyId: 'flk_unregistered0',
      roundNo,
      schemaVersion: SCHEMA_VERSION,
      baseModelVersion: base.version,
      delta: new Array(DIM).fill(5),
      numExamples: 5000,
      localMetrics: { valExamples: 0, valAccuracy: 1, valLogLoss: 0 },
    });
    updates.push(forged);
    tags.set(forged.participantKeyId, 'forged');
  }

  // Stable order for the log.
  updates.sort((a, b) => a.participantKeyId.localeCompare(b.participantKeyId));
  dropped.sort((a, b) => a.keyId.localeCompare(b.keyId));

  const result = runCoordinator({ roundNo, base, registry, updates, dropped, config });
  for (const r of result.records) if (tags.has(r.keyId)) r.simulated = tags.get(r.keyId);

  const cohort = {
    invited: n,
    responded: n - dropped.length,
    accepted: result.records.filter((r) => r.outcome === 'accepted').length,
    rejected: result.records.filter((r) => r.outcome === 'rejected').length,
    dropped: dropped.length,
    minCohort: config.minCohort,
  };
  const previousGlobal = evaluate(base.weights);
  const locals = localBaselines(
    base.weights,
    result.records.filter((r) => result.deltasByKey.has(r.keyId)).map((r) => ({ label: r.label, delta: result.deltasByKey.get(r.keyId)!, valAccuracy: r.localMetrics?.valAccuracy, outcome: r.outcome })),
  );
  const metrics: Record<string, unknown> = {
    holdout: holdoutInfo(),
    cohort,
    weighting: `FedAvg — weight ∝ min(numExamples, ${config.weightCap}), after L2 clipping to ${config.clipNorm}`,
    majorityBaseline: majorityBaseline(),
    previousGlobal: { version: base.version, ...previousGlobal },
    localModelKind: base.weights.every((w) => w === 0) ? 'local-only (trained from the untrained genesis model)' : 'round base + that participant’s update only',
    localModels: locals.map((l) => ({ label: l.label, outcome: l.outcome, valAccuracy: l.valAccuracy, ...l.metrics })),
    dp: result.dpApplied ? { applied: true, noiseMultiplier: config.dpNoiseMultiplier, accounting: 'none — simulated design sketch, no formal (ε, δ) guarantee' } : { applied: false },
  };
  if (result.status === 'completed') {
    const global = evaluate(result.weights!);
    metrics.global = global;
    metrics.aggregateNorm = result.aggregateNorm;
    metrics.improvement = { accuracyVsPrevious: round(global.accuracy - previousGlobal.accuracy), logLossVsPrevious: round(global.logLoss - previousGlobal.logLoss) };
    metrics.skewNote = skewNote(global, locals, base.weights.every((w) => w === 0));
  } else {
    metrics.abortReason = result.abortReason;
  }
  return { status: result.status, abortReason: result.abortReason, weights: result.weights, records: result.records, metrics, coordinator: result };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: no update within ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
