# P2 — Federated model-learning programme

An explicitly separate, opt-in programme. Participating client environments train a shared model locally and send governed model updates; a coordinator validates and aggregates them into a **candidate** model that a human must approve and deploy.

It is **not** the collective learning hub. The hub moves observations through moderation into shared insights; nothing there trains a model, and centralising observations to train on them would not be federated training.

Everything here is **simulated with synthetic data**: the "client environments" are isolated directories and function calls on one server.

| Where | What |
| --- | --- |
| `/hub/federated` | Programme page (all employees read; portal admins run rounds and decide on models) |
| `/w/<org>/team` | Client-admin opt-in / withdrawal panel |
| `lib/federated/` | `model.ts` contract + maths · `data.ts` generator · `client.ts` client runtime · `coordinator.ts` validation/aggregation · `evaluate.ts` holdout · `round.ts` orchestration · `service.ts` DB + policy |
| `npm run fl:demo` | One round end-to-end in the terminal (`PGLITE_DIR=memory:// npm run fl:demo`) |
| Tests | `tests/unit/federated.test.ts`, `tests/security/federated.test.ts` |

## Learning task and model

- **Task:** binary classification — does a synthetic SME credit application need human credit review (1) or not (0)?
- **Model:** logistic regression, weight vector `[bias, w1..w6]`. Fixed family; no per-client architecture.
- **Local job:** 40 epochs of full-batch gradient descent (lr 0.5, L2 0.001) starting from the deployed global model, on an 80/20 local train/validation split. The client returns `local − base` as its update.

## Feature schema (`sme-review/1.0`)

| # | Feature | Meaning | Agreed mean | Agreed sd |
| - | --- | --- | --- | --- |
| 1 | `revenue_volatility` | coefficient of variation of monthly revenue | 0.35 | 0.20 |
| 2 | `seasonality_index` | peak-quarter revenue share, 0–1 | 0.40 | 0.20 |
| 3 | `debt_service_coverage` | DSCR | 1.40 | 0.50 |
| 4 | `log_months_trading` | ln(1 + months trading) | 3.60 | 0.90 |
| 5 | `document_completeness` | fraction of required documents supplied | 0.80 | 0.15 |
| 6 | `sector_risk` | programme-agreed sector score, 0–1 | 0.50 | 0.20 |

### Compatibility assumptions

- Same schema version, feature order and units at every participant.
- Standardisation uses the **programme constants above**, never local statistics, so a weight means the same thing everywhere.
- Shared label definition (1 = routed to human review).
- Updates are deltas against the exact base version announced for the round; other bases or dimensions are rejected.

## Synthetic data and isolation

- Ground truth: a fixed logistic model in standardised space plus one interaction term (`volatility × sector_risk`) the linear model cannot represent exactly.
- Each participant's data is generated deterministically from its key with **deliberate skew**: shifted feature means (±0.9 sd), different spreads (0.55–1.15), a different review-rate policy (intercept offset ±1.3) and size (160–900 rows).
- Records are written only to `storage/federated/<participantKey>/train.json` (git-ignored; falls back to the OS temp dir on a read-only filesystem). Only `client.ts` reads them, and only its own key's directory.
- The **global holdout** (2,000 rows, `holdout-v1`) is generated from the unshifted population with its own seed. It is not derived from any participant and stays with the evaluator.
- `coordinator.ts` imports no data generator, client runtime or filesystem module (unit-tested). It only ever receives update objects.

## Round protocol

1. Portal admin starts a round (`run_federated` → `portal_admin` grant). Base = the currently **deployed** model.
2. Every **enrolled** participant is invited. Each client runtime loads its own data, trains, evaluates on its local validation split and returns a signed update: `{participantKeyId, roundNo, schemaVersion, baseModelVersion, delta[7], numExamples, localMetrics, signature}`.
3. The coordinator validates every update, runs poisoning checks across the cohort, enforces the minimum cohort, clips, aggregates and (optionally) adds sketch noise.
4. The evaluator scores the new model and baselines on the holdout.
5. One append-only `fl_rounds` row is written (participants metadata, update hashes, reasons, metrics). If the round completed, an `fl_models` row is registered as `candidate` with `parentVersion` = base. Both are audited.

### Validation (per update, in order)

| Check | Rejection reason |
| --- | --- |
| Known participant key + valid HMAC | `unauthenticated` |
| Participant currently enrolled | `not_enrolled` |
| One update per participant per round | `duplicate` |
| Bound to this round | `wrong_round` |
| Schema version | `schema_mismatch` |
| Dimension = 7 | `dimension_mismatch` |
| All values finite | `non_finite` |
| Trained on the announced base | `stale_base` |
| Plausible example count (≥ 50) | `implausible_example_count` |
| ‖Δ‖ ≤ 3 × cohort median norm | `norm_outlier` |
| cosine(Δ, coordinate-wise median Δ) ≥ 0 (for updates ≥ ½ median norm) | `direction_outlier` |

Fewer than three accepted updates → the round is **aborted**, logged, and no model is registered.

### Weighting

FedAvg after clipping: each accepted update is L2-clipped to 4.0, then weighted by `min(numExamples, 600)` / Σ. The cap stops one large participant dominating.

### Simulated fault scenarios (tagged `sim:` in the log)

- **Dropout:** one participant's job never returns (timeout) → recorded as `dropped`. The round continues if ≥ 3 updates are still accepted.
- **Poisoning:** one participant's runtime is "compromised": it flips and amplifies its update ×8 and signs it validly. Authentication passes; the norm and direction checks reject it.
- **Forged sender:** an unregistered key injects an update → `unauthenticated`.

With the four seeded participants, dropout **and** poisoning together leave two honest updates, so the round aborts on minimum cohort — which is the intended behaviour. Enrol a fifth org (e.g. Meridian) and all three scenarios complete.

## Metrics and baselines

Every round reports, on the holdout: accuracy, log-loss and AUC (Mann–Whitney) for

- the **majority-class baseline** (constant prediction; log-loss ln 2, AUC 0.5),
- the **previous global** model (the round base),
- each participant **alone** (base + only its own update; in round 1 that is a purely local model),
- the **new global** model.

No centralised "pooled data" reference is computed: that would require exactly the pooling a real programme avoids.

### How skew affects the result

The computed skew note on each round compares single-participant models against the aggregate and against their own local validation accuracy. Typical pattern in the seeded run: a participant whose population is shifted looks better on its own validation split than on the shared holdout; local-only models vary by several accuracy points; the aggregate is at or near the top because it sees all populations. Skew still distorts the aggregate: intercept (review-policy) differences between clients are averaged rather than reconciled, and larger clients pull harder (which the weight cap limits). The aggregate can be worse than a local model for a specific client — a per-client calibration step would be the production answer.

## Consent, logging and data minimisation

- **Programme consent** is a separate permission (§09): a client admin enrols their own organisation (`manage_client_roles` on the active tenant) after ticking a versioned consent (`fl-consent/2026-10`). Membership, observation storage and publishing consent do not enrol anyone.
- **Logged:** consent (who, when, version, consent-text hash — audit event), participants (pseudonymous label `P-XXXX`; org mapping visible to portal admins only), base and candidate versions, update hashes, norms, weights, accept/reject/drop reasons, aggregation method and config, evaluation outcomes, every review decision.
- **Never logged or sent to the coordinator:** training examples, features, labels or local validation rows. A security test asserts that round and model rows contain no example data.
- `fl_rounds` is **append-only** for the application role (UPDATE/DELETE revoked).

## Threat model

- **Updates leak information.** Gradients/weight deltas can enable membership or attribute inference and, for small cohorts, partial reconstruction. Keeping raw data local does **not** by itself provide confidentiality, anonymity or regulatory compliance.
- **Malicious clients can poison training** (scaling, sign flipping, targeted backdoors). A compromised but authenticated client passes authentication.
- **The coordinator is trusted** in this design: it sees each update in the clear, owns the holdout, and derives participant keys.
- **Skew** is not an attack but changes who the model works well for.

## Controls — honest status

| Control | Status | Notes |
| --- | --- | --- |
| Separate programme consent + withdrawal | Implemented | Versioned, audited, client-admin only |
| Raw data stays local | **Simulated** | Separate directories on one server; coordinator has no data import path |
| Authenticated participants | **Simulated** | HMAC per participant, key derived from `AUTH_SECRET` + key id. Production: mTLS / attested workload identity, keys the coordinator cannot derive |
| Update validation | Implemented | Table above |
| Minimum cohort (3) | Implemented | Abort, no model |
| Bounded / clipped updates | Implemented | L2 clip 4.0, weight cap 600 |
| Poisoning checks | Implemented (heuristic) | Norm and direction outliers. Will miss subtle/colluding attacks; can reject honest outliers |
| Secure aggregation | **Not implemented** | Plain weighted averaging is not secure aggregation; individual updates are visible to the coordinator |
| Differential privacy | **Not implemented (design sketch only)** | See below |
| Human review + deployment decision | Implemented | candidate → approved → deployed; rollback; note required; audited |

## Differential-privacy design and accounting statement

Optional (off by default): Gaussian noise with σ = `noiseMultiplier × clipNorm × max participant weight` is added to the clipped aggregate. This matches the shape of user-level DP-FedAvg (clip, then noise calibrated to one participant's maximum influence), **but no privacy accounting is performed, sampling is not Poisson, and no (ε, δ) is claimed.** The noise uses a deterministic PRNG so it is reproducible — which is itself unacceptable for real DP. Production would use a vetted library with an RDP/PLD accountant, a fixed privacy budget per programme period, and secure randomness, ideally combined with secure aggregation so noise is applied before the coordinator sees individual updates.

## Withdrawal and lineage policy

- Withdrawal is immediate: the participant is not invited again and any update it still sends is rejected (`not_enrolled`).
- Models are **not untrained**. Each model's lineage records the participants that contributed accepted updates to it or any ancestor.
- A model whose lineage includes a withdrawn participant is flagged and **cannot be newly deployed** (`409 lineage_includes_withdrawn`). A model already deployed stays until a reviewer rolls it back.
- Remediation is explicit: roll back to an ancestor that predates the participant's contributions and retrain from there with the remaining cohort.
- Re-enrolment requires fresh consent and applies to future rounds only.

## Deployment and rollback design

- Exactly one model is deployed; the next round always trains from it (`fl-v0` is an untrained all-zero genesis model, the lineage root).
- `candidate → approved | rejected` (human, note required) → `approved → deployed` (the previously deployed model returns to `approved`).
- **Rollback:** the deployed model becomes `rolled_back` and its **parent** (the model it was trained from, which was deployed at the time) is redeployed.
- All transitions are audited (`federated.model.*`); round rows are append-only.

## Seeded demo state

Northwind, Harbor, Cedar and Atlas are enrolled; Meridian and Bluewater are not (enrol from `/w/meridian/team` as `mia.admin@meridian.example`).

1. Round 1 — dropout + forged sender → completed → `fl-v1`, approved and deployed (seeded review decision).
2. Round 2 — poisoned update + forged sender → completed → `fl-v2`, **candidate awaiting review**.
3. Round 3 — dropout + poisoning together → **aborted** on minimum cohort.

## What would change for production

- Real, separately operated client environments running an attested, signed training image; the coordinator triggers jobs but never has a path to client storage.
- Participant identity via mTLS / workload identity with per-participant keys held by the client; key rotation on re-enrolment.
- Secure aggregation (e.g. pairwise-masking protocols) so the coordinator only sees the sum; dropout-tolerant variants.
- Formal DP with an accountant and a published budget; robust aggregation (trimmed mean / Krum-style) alongside validation.
- Per-client evaluation and calibration, fairness checks across participants, model cards per version, and a scheduled lineage review when anyone withdraws.
