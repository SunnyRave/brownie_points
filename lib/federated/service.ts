import { desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { schema, withSystemTx, type Tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { enforce, can } from '@/lib/policy/enforce';
import { HttpError, badRequest, notFound } from '@/lib/http';
import { hashToken, sha256b64url } from '@/lib/crypto';
import type { Principal } from '@/lib/policy/types';
import { simulateRound } from './round';
import { COMPATIBILITY, DIM, FEATURES, FEATURE_KEYS, SCHEMA_VERSION, round } from './model';
import { holdoutInfo } from './evaluate';
import { DEFAULT_CONFIG, type ParticipantRecord, type RegistryEntry, type RoundConfig } from './types';
import { FL_CONSENT_POINTS, FL_CONSENT_VERSION } from './policy';

const programme = { type: 'federated_programme', audience: { kind: 'employee' as const } };
const tenantRes = (p: Principal | null) => ({ type: 'federated_enrolment', audience: p?.activeTenantId ? { kind: 'tenant' as const, tenantId: p.activeTenantId } : null });
const conflict = (code: string, message: string) => new HttpError(409, code, message);

/** Pseudonymous participant key, stable per org (HMAC of the slug under AUTH_SECRET). */
export const keyIdFor = (orgSlug: string) => `flk_${hashToken(`fl-key:${orgSlug}`).slice(0, 10)}`;
export const labelFor = (keyId: string) => `P-${keyId.slice(4, 8).toUpperCase()}`;

// ───────────── core (tx-level, also used by the seed) ─────────────

async function deployedModel(tx: Tx) {
  const [m] = await tx.select().from(schema.flModels).where(eq(schema.flModels.status, 'deployed'));
  if (m) return m;
  // Genesis: an untrained all-zero reference model so lineage always has a root.
  const [g] = await tx
    .insert(schema.flModels)
    .values({ version: 'fl-v0', weights: new Array(DIM).fill(0), featureSchema: FEATURE_KEYS, status: 'deployed', decidedBy: 'bootstrap', decisionNote: 'Untrained genesis model (all-zero weights) — lineage root.', decidedAt: new Date(), metrics: {} })
    .onConflictDoNothing()
    .returning();
  if (g) return g;
  throw conflict('no_deployed_model', 'No model is deployed. Deploy an approved model before running a round.');
}

async function registry(tx: Tx): Promise<(RegistryEntry & { orgId: string; orgName: string })[]> {
  const rows = await tx
    .select({ p: schema.flParticipants, orgName: schema.organisations.name })
    .from(schema.flParticipants)
    .innerJoin(schema.organisations, eq(schema.organisations.id, schema.flParticipants.orgId))
    .orderBy(schema.flParticipants.keyId);
  return rows.map(({ p, orgName }) => ({ participantId: p.id, keyId: p.keyId, label: labelFor(p.keyId), status: p.status, orgId: p.orgId, orgName }));
}

export async function executeRound(tx: Tx, actorId: string, config: RoundConfig = DEFAULT_CONFIG) {
  const base = await deployedModel(tx);
  const reg = await registry(tx);
  const [last] = await tx.select({ n: schema.flRounds.roundNo }).from(schema.flRounds).orderBy(desc(schema.flRounds.roundNo)).limit(1);
  const roundNo = (last?.n ?? 0) + 1;
  const startedAt = new Date();
  const outcome = await simulateRound({ roundNo, base: { version: base.version, weights: base.weights }, registry: reg, config });
  const version = `fl-v${roundNo}`;

  // Append-only round log: metadata + metrics only. Records carry no examples, features or weights.
  const [r] = await tx
    .insert(schema.flRounds)
    .values({
      roundNo,
      modelVersion: outcome.status === 'completed' ? version : '(none — aborted)',
      baseModelVersion: base.version,
      aggregationMethod: 'fedavg-weighted-clipped',
      config: { ...config, schemaVersion: SCHEMA_VERSION, holdout: holdoutInfo().version, participantAuth: 'simulated-hmac', secureAggregation: false },
      participants: outcome.records as unknown as Record<string, unknown>[],
      metrics: outcome.metrics,
      status: outcome.status,
      startedBy: actorId,
      startedAt,
      finishedAt: new Date(),
    })
    .returning();

  let model: typeof schema.flModels.$inferSelect | null = null;
  if (outcome.status === 'completed') {
    [model] = await tx
      .insert(schema.flModels)
      .values({ version, roundId: r.id, parentVersion: base.version, weights: outcome.weights!.map((w) => round(w, 6)), featureSchema: FEATURE_KEYS, metrics: outcome.metrics, status: 'candidate' })
      .returning();
  }
  await audit(tx, {
    actorId,
    action: `federated.round.${outcome.status}`,
    resourceType: 'fl_round',
    resourceId: r.id,
    meta: { roundNo, baseModelVersion: base.version, candidate: model?.version ?? null, cohort: outcome.metrics.cohort, abortReason: outcome.abortReason ?? null },
  });
  return { round: r, model };
}

const decisionSchema = z.object({ decision: z.enum(['approve', 'reject', 'deploy', 'rollback']), note: z.string().trim().min(5, 'A decision note is required').max(1000) });

export async function applyDecision(tx: Tx, actorId: string, modelId: string, raw: unknown) {
  const { decision, note } = decisionSchema.parse(raw);
  const [m] = await tx.select().from(schema.flModels).where(eq(schema.flModels.id, modelId));
  if (!m) throw notFound();
  const stamp = { decidedBy: actorId, decisionNote: note, decidedAt: new Date() };
  const set = (id: string, status: typeof m.status, extra: Partial<typeof stamp> = stamp) => tx.update(schema.flModels).set({ status, ...extra }).where(eq(schema.flModels.id, id));

  if (decision === 'approve' || decision === 'reject') {
    if (m.status !== 'candidate') throw conflict('invalid_transition', `Only candidates can be ${decision}d (model is ${m.status}).`);
    await set(m.id, decision === 'approve' ? 'approved' : 'rejected');
  } else if (decision === 'deploy') {
    if (m.status !== 'approved') throw conflict('invalid_transition', 'A model must be approved by a reviewer before it can be deployed.');
    const lin = await lineage(tx);
    const flagged = lin.get(m.version)?.withdrawn ?? [];
    if (flagged.length) throw conflict('lineage_includes_withdrawn', `Lineage includes withdrawn participant(s) ${flagged.join(', ')}; programme policy blocks new deployment. Roll back and retrain instead.`);
    const [current] = await tx.select().from(schema.flModels).where(eq(schema.flModels.status, 'deployed'));
    if (current) await set(current.id, 'approved', {});
    await set(m.id, 'deployed');
  } else {
    if (m.status !== 'deployed') throw conflict('invalid_transition', 'Only the deployed model can be rolled back.');
    if (!m.parentVersion) throw badRequest('no_parent', 'The genesis model has no parent to roll back to.');
    const [parent] = await tx.select().from(schema.flModels).where(eq(schema.flModels.version, m.parentVersion));
    if (!parent) throw notFound('parent_missing');
    await set(m.id, 'rolled_back');
    await set(parent.id, 'deployed');
  }
  await audit(tx, { actorId, action: `federated.model.${decision}`, resourceType: 'fl_model', resourceId: m.id, meta: { version: m.version, from: m.status, parentVersion: m.parentVersion, note } });
  const [after] = await tx.select().from(schema.flModels).where(eq(schema.flModels.id, m.id));
  return after;
}

/** Per model version: participant labels that contributed accepted updates to it or any ancestor. */
async function lineage(tx: Tx) {
  const [models, rounds, reg] = await Promise.all([tx.select().from(schema.flModels), tx.select().from(schema.flRounds), registry(tx)]);
  const byVersion = new Map(models.map((m) => [m.version, m]));
  const roundById = new Map(rounds.map((r) => [r.id, r]));
  const withdrawn = new Set(reg.filter((r) => r.status === 'withdrawn').map((r) => r.participantId));
  const memo = new Map<string, { contributors: Map<string, string>; chain: string[] }>();
  const walk = (version: string, depth = 0): { contributors: Map<string, string>; chain: string[] } => {
    if (memo.has(version)) return memo.get(version)!;
    const m = byVersion.get(version);
    const own = new Map<string, string>();
    const records = (m?.roundId ? (roundById.get(m.roundId)?.participants ?? []) : []) as unknown as ParticipantRecord[];
    for (const r of records) if (r.outcome === 'accepted' && r.participantId) own.set(r.participantId, r.label);
    const parent = m?.parentVersion && depth < 1000 ? walk(m.parentVersion, depth + 1) : { contributors: new Map<string, string>(), chain: [] };
    const out = { contributors: new Map([...parent.contributors, ...own]), chain: [...parent.chain, version] };
    memo.set(version, out);
    return out;
  };
  return new Map(
    models.map((m) => {
      const l = walk(m.version);
      return [m.version, { chain: l.chain, contributors: [...l.contributors.values()], withdrawn: [...l.contributors.entries()].filter(([id]) => withdrawn.has(id)).map(([, label]) => label) }];
    }),
  );
}

// ───────────── services ─────────────

export async function getProgramme(principal: Principal | null) {
  await enforce(principal, 'read', programme);
  const isAdmin = can(principal, 'run_federated', programme);
  return withSystemTx(async (tx) => {
    await deployedModel(tx).catch(() => null);
    const [reg, rounds, models, lin] = await Promise.all([
      registry(tx),
      tx.select().from(schema.flRounds).orderBy(desc(schema.flRounds.roundNo)),
      tx.select().from(schema.flModels).orderBy(desc(schema.flModels.createdAt)),
      lineage(tx),
    ]);
    const parts = await tx.select().from(schema.flParticipants);
    const userIds = [...new Set([...rounds.map((r) => r.startedBy), ...models.map((m) => m.decidedBy ?? ''), ...parts.map((p) => p.consentedBy)])].filter(Boolean);
    const users = userIds.length ? await tx.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, userIds)) : [];
    const name = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? id) : null);
    const roundNoById = new Map(rounds.map((r) => [r.id, r.roundNo]));
    const deployed = models.find((m) => m.status === 'deployed') ?? null;
    return {
      isAdmin,
      task: { schemaVersion: SCHEMA_VERSION, features: FEATURES, compatibility: COMPATIBILITY, holdout: holdoutInfo(), defaults: DEFAULT_CONFIG },
      participants: reg.map((r) => {
        const p = parts.find((x) => x.id === r.participantId)!;
        // Org identity and who consented are visible to portal admins only; everyone else sees pseudonyms.
        return { label: r.label, status: r.status, consentedAt: p.consentedAt, withdrawnAt: p.withdrawnAt, ...(isAdmin ? { orgName: r.orgName, consentedBy: name(p.consentedBy) } : {}) };
      }),
      rounds: rounds.map((r) => ({
        id: r.id, roundNo: r.roundNo, modelVersion: r.modelVersion, baseModelVersion: r.baseModelVersion, aggregationMethod: r.aggregationMethod,
        config: r.config, participants: r.participants as unknown as ParticipantRecord[], metrics: r.metrics, status: r.status,
        startedBy: name(r.startedBy), startedAt: r.startedAt, finishedAt: r.finishedAt,
      })),
      models: models.map((m) => ({
        id: m.id, version: m.version, parentVersion: m.parentVersion, roundNo: m.roundId ? (roundNoById.get(m.roundId) ?? null) : null,
        status: m.status, weights: m.weights, featureSchema: m.featureSchema, global: (m.metrics as { global?: unknown }).global ?? null,
        decidedBy: m.decidedBy === 'bootstrap' ? 'system (genesis)' : name(m.decidedBy), decisionNote: m.decisionNote, decidedAt: m.decidedAt, createdAt: m.createdAt,
        lineage: lin.get(m.version) ?? { chain: [m.version], contributors: [], withdrawn: [] },
      })),
      deployedVersion: deployed?.version ?? null,
      enrolledCount: reg.filter((r) => r.status === 'enrolled').length,
    };
  });
}

const runSchema = z.object({
  scenarios: z.object({ dropout: z.boolean(), poison: z.boolean(), forged: z.boolean() }).partial().default({}),
  dpNoiseMultiplier: z.number().min(0).max(2).default(0),
});

export async function runRound(principal: Principal | null, raw: unknown) {
  await enforce(principal, 'run_federated', programme);
  const input = runSchema.parse(raw ?? {});
  const config: RoundConfig = { ...DEFAULT_CONFIG, dpNoiseMultiplier: input.dpNoiseMultiplier, scenarios: { ...DEFAULT_CONFIG.scenarios, ...input.scenarios } };
  return withSystemTx(async (tx) => {
    const { round: r, model } = await executeRound(tx, principal!.userId, config);
    return { roundNo: r.roundNo, status: r.status, modelVersion: model?.version ?? null, abortReason: (r.metrics as { abortReason?: string }).abortReason ?? null };
  });
}

export async function decideModel(principal: Principal | null, modelId: string, raw: unknown) {
  await enforce(principal, 'run_federated', { ...programme, id: modelId });
  const m = await withSystemTx((tx) => applyDecision(tx, principal!.userId, modelId, raw));
  return { id: m.id, version: m.version, status: m.status };
}

// ───────────── client-admin programme consent (own organisation only) ─────────────

export async function getMyEnrolment(principal: Principal | null) {
  await enforce(principal, 'manage_client_roles', tenantRes(principal));
  return withSystemTx(async (tx) => {
    const [p] = await tx.select().from(schema.flParticipants).where(eq(schema.flParticipants.orgId, principal!.activeTenantId!));
    if (!p) return { status: 'not_enrolled' as const, consentVersion: FL_CONSENT_VERSION };
    const rounds = await tx.select({ participants: schema.flRounds.participants, status: schema.flRounds.status }).from(schema.flRounds);
    const contributed = rounds.filter((r) => r.status === 'completed' && (r.participants as unknown as ParticipantRecord[]).some((x) => x.participantId === p.id && x.outcome === 'accepted')).length;
    return { status: p.status, label: labelFor(p.keyId), consentedAt: p.consentedAt, withdrawnAt: p.withdrawnAt, roundsContributed: contributed, consentVersion: FL_CONSENT_VERSION };
  });
}

const enrolSchema = z.object({ consent: z.literal(true, { errorMap: () => ({ message: 'Explicit programme consent is required' }) }), consentVersion: z.literal(FL_CONSENT_VERSION) });

export async function enrol(principal: Principal | null, raw: unknown) {
  await enforce(principal, 'manage_client_roles', tenantRes(principal));
  const input = enrolSchema.parse(raw);
  const orgId = principal!.activeTenantId!;
  return withSystemTx(async (tx) => {
    const [org] = await tx.select().from(schema.organisations).where(eq(schema.organisations.id, orgId));
    if (!org || org.type !== 'client') throw badRequest('not_a_client_org');
    const [existing] = await tx.select().from(schema.flParticipants).where(eq(schema.flParticipants.orgId, orgId));
    if (existing?.status === 'enrolled') throw conflict('already_enrolled', 'Your organisation is already enrolled.');
    const values = { status: 'enrolled' as const, consentedBy: principal!.userId, consentedAt: new Date(), withdrawnAt: null };
    const [row] = existing
      ? await tx.update(schema.flParticipants).set(values).where(eq(schema.flParticipants.id, existing.id)).returning()
      : await tx.insert(schema.flParticipants).values({ ...values, orgId, keyId: keyIdFor(org.slug) }).returning();
    await audit(tx, { actorId: principal!.userId, action: 'federated.enrol', resourceType: 'fl_participant', resourceId: row.id, tenantId: orgId, meta: { consentVersion: input.consentVersion, consentTextHash: sha256b64url(FL_CONSENT_POINTS.join('\n')), reEnrolment: !!existing } });
    return { status: row.status, label: labelFor(row.keyId) };
  });
}

export async function withdraw(principal: Principal | null) {
  await enforce(principal, 'manage_client_roles', tenantRes(principal));
  const orgId = principal!.activeTenantId!;
  return withSystemTx(async (tx) => {
    const [p] = await tx.select().from(schema.flParticipants).where(eq(schema.flParticipants.orgId, orgId));
    if (!p || p.status !== 'enrolled') throw conflict('not_enrolled', 'Your organisation is not enrolled.');
    await tx.update(schema.flParticipants).set({ status: 'withdrawn', withdrawnAt: new Date() }).where(eq(schema.flParticipants.id, p.id));
    await audit(tx, { actorId: principal!.userId, action: 'federated.withdraw', resourceType: 'fl_participant', resourceId: p.id, tenantId: orgId, meta: { effect: 'excluded from future rounds; existing models flagged in lineage, not untrained' } });
    return { status: 'withdrawn' as const };
  });
}
