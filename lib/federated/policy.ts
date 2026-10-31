/** Programme texts shared by server and client components (pure strings, no imports). */

export const FL_CONSENT_VERSION = 'fl-consent/2026-10';

export const FL_CONSENT_POINTS = [
  'This is a separate, opt-in programme. Workspace membership, observation storage and publishing consent do not enrol you, and enrolling does not change them.',
  'Your training records stay in your own environment. Only model updates (weight differences), an example count and local validation metrics are sent to the coordinator.',
  'Model updates can still leak information about the data they were trained on. Local retention is not by itself confidentiality, anonymity or regulatory compliance.',
  'Each round your update is authenticated, validated, clipped and may be rejected. Aggregates are only candidates until an Azentio reviewer approves and deploys them.',
  'You can withdraw at any time. Withdrawal stops future participation immediately; models already aggregated are not "untrained" (see the lineage policy).',
];

export const FL_WITHDRAWAL_POLICY = [
  'Withdrawal takes effect immediately: the participant is not invited to further rounds and any update it still sends is rejected (not_enrolled).',
  'Already-aggregated models are not untrained. Every model records which participants contributed to it and to its ancestors.',
  'A model whose lineage includes a withdrawn participant is flagged and cannot be newly deployed. A model already deployed stays until a reviewer rolls it back.',
  'Remediation is explicit: roll back to an ancestor that predates the participant’s contributions and retrain from there with the remaining cohort.',
  'Re-enrolment requires fresh consent and applies to future rounds only.',
];

export const FL_ROLLBACK_DESIGN = [
  'Exactly one model is deployed at a time; the next round always trains from the deployed model.',
  'Deploying an approved model supersedes the current one (it returns to "approved" and can be redeployed).',
  'Rollback marks the deployed model rolled_back and restores its parent version — the model it was trained from, which was itself deployed at the time.',
  'Every transition requires a human decision with a note and is audited; round records are append-only.',
];
