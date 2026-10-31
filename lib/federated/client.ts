import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateParticipantDataset } from './data';
import { prng } from './rng';
import { DIM, SCHEMA_VERSION, metricsFor, predict, standardise, train, type Example } from './model';
import { signUpdate } from './auth';
import type { SignedUpdate } from './types';

/**
 * CLIENT RUNTIME — stands in for code running inside a participant's own environment.
 * It reads only its own directory and returns a signed update. The coordinator never imports this file;
 * the simulation harness (round.ts) calls it the way a real orchestrator would call a remote job.
 */

const KEY_RE = /^flk_[a-z0-9]{6,32}$/;

export function storageRoot() {
  return process.env.FL_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'federated');
}

/** Each participant's records live only under <root>/<keyId>/train.json (materialised on first use). */
export function loadLocalDataset(keyId: string): Example[] {
  if (!KEY_RE.test(keyId)) throw new Error('invalid participant key');
  for (const root of [storageRoot(), path.join(os.tmpdir(), 'azentio-federated')]) {
    const file = path.join(root, keyId, 'train.json');
    try {
      if (fs.existsSync(file)) return (JSON.parse(fs.readFileSync(file, 'utf8')) as { records: Example[] }).records;
      const records = generateParticipantDataset(keyId);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ schemaVersion: SCHEMA_VERSION, keyId, synthetic: true, records }));
      return records;
    } catch {
      // Read-only filesystem (e.g. serverless): fall back to the OS temp dir, then regenerate in memory.
    }
  }
  return generateParticipantDataset(keyId);
}

export type ClientJob = {
  keyId: string;
  /** Provisioned credential for this participant (see auth.ts). */
  secret: string;
  roundNo: number;
  base: { version: string; weights: number[] };
  epochs: number;
  lr: number;
  l2: number;
  /** Simulation-only fault injection: a compromised runtime that flips and amplifies its update. */
  fault?: 'poison';
};

export async function runLocalTraining(job: ClientJob): Promise<SignedUpdate> {
  if (job.base.weights.length !== DIM) throw new Error('incompatible base model');
  const records = loadLocalDataset(job.keyId).map((r) => ({ z: standardise(r.f), y: r.y }));

  // Deterministic local train/validation split; validation stays local and only its metrics are reported.
  const r = prng(`split:${job.keyId}`);
  const shuffled = records.map((x) => ({ x, k: r.next() })).sort((a, b) => a.k - b.k).map((o) => o.x);
  const nVal = Math.max(1, Math.floor(shuffled.length * 0.2));
  const val = shuffled.slice(0, nVal);
  const trn = shuffled.slice(nVal);

  const local = train(trn, job.base.weights, { epochs: job.epochs, lr: job.lr, l2: job.l2 });
  const m = metricsFor(val.map((e) => predict(local, e.z)), val.map((e) => e.y));
  let delta = local.map((w, i) => w - job.base.weights[i]);
  if (job.fault === 'poison') delta = delta.map((d) => -8 * d);

  return signUpdate(job.secret, {
    participantKeyId: job.keyId,
    roundNo: job.roundNo,
    schemaVersion: SCHEMA_VERSION,
    baseModelVersion: job.base.version,
    delta,
    numExamples: trn.length,
    localMetrics: { valExamples: val.length, valAccuracy: m.accuracy, valLogLoss: m.logLoss },
  });
}
