/** Wire format between a client runtime and the coordinator. Contains model numbers only — no examples. */
export type ModelUpdate = {
  participantKeyId: string;
  roundNo: number;
  schemaVersion: string;
  baseModelVersion: string;
  /** Local weights minus base weights, length DIM. */
  delta: number[];
  numExamples: number;
  /** Measured on the participant's own local validation split. */
  localMetrics: { valExamples: number; valAccuracy: number; valLogLoss: number };
};
export type SignedUpdate = ModelUpdate & { signature: string };

export type RegistryEntry = { participantId: string; keyId: string; label: string; status: 'enrolled' | 'withdrawn' };

export type RoundConfig = {
  localEpochs: number;
  learningRate: number;
  l2: number;
  /** L2 bound applied to every accepted update before aggregation. */
  clipNorm: number;
  /** Reject an update whose norm exceeds this multiple of the cohort's median norm. */
  normOutlierFactor: number;
  /** Reject an update whose cosine similarity to the coordinate-wise median update is below this. */
  minCosine: number;
  minCohort: number;
  /** FedAvg weight = min(numExamples, weightCap). Limits how far one large participant dominates. */
  weightCap: number;
  minExamples: number;
  timeoutMs: number;
  /** Design sketch only: Gaussian noise on the clipped aggregate, no privacy accounting. Off by default. */
  dpNoiseMultiplier: number;
  scenarios: { dropout: boolean; poison: boolean; forged: boolean };
};

export const DEFAULT_CONFIG: RoundConfig = {
  localEpochs: 40,
  learningRate: 0.5,
  l2: 0.001,
  clipNorm: 4,
  normOutlierFactor: 3,
  minCosine: 0,
  minCohort: 3,
  weightCap: 600,
  minExamples: 50,
  timeoutMs: 1500,
  dpNoiseMultiplier: 0,
  scenarios: { dropout: true, poison: true, forged: true },
};

export type Outcome = 'accepted' | 'rejected' | 'dropped';

/** What the round log stores per participant. Metadata only. */
export type ParticipantRecord = {
  participantId: string | null;
  keyId: string;
  label: string;
  outcome: Outcome;
  reasons: string[];
  /** Simulation tag so injected faults are labelled honestly in the log. */
  simulated?: 'dropout' | 'poisoned' | 'forged';
  numExamples?: number;
  updateNorm?: number;
  clipped?: boolean;
  cosineToMedian?: number;
  weight?: number;
  updateHash?: string;
  localMetrics?: ModelUpdate['localMetrics'];
};
