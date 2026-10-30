import { and, desc, eq, ne } from 'drizzle-orm';
import { schema, withTenantTx, type Tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/outbox';
import { enforce } from '@/lib/policy/enforce';
import { badRequest, forbidden, notFound, HttpError } from '@/lib/http';
import { scanSensitive } from '@/lib/scan';
import { removeFromIndex } from '@/lib/search';
import { nextState, TransitionError, STATE_LABELS, type ObservationState, type TransitionEvent } from '@/lib/learning/stateMachine';
import { toAuthorReviewDTO, toOwnObservationDTO } from '@/lib/learning/dto';
import { observationDraftSchema, submitSchema, type ObservationDraftInput } from '@/lib/validation';
import type { Principal } from '@/lib/policy/types';

type Obs = typeof schema.observations.$inferSelect;

/** Every observation endpoint runs in the session's active tenant; client-sent tenant IDs are never read. */
async function tenantOf(principal: Principal | null, action: 'read' | 'create' | 'update' | 'submit' | 'withdraw' | 'delete') {
  const tenantId = principal?.activeTenantId ?? null;
  await enforce(principal, action, { type: 'observation', audience: tenantId ? { kind: 'tenant', tenantId } : null });
  return { principal: principal!, tenantId: tenantId! };
}

async function loadOwn(tx: Tx, principal: Principal, id: string) {
  // RLS restricts this to the active tenant; the author check narrows it to the author's own records.
  const [obs] = await tx.select().from(schema.observations).where(eq(schema.observations.id, id)).limit(1);
  if (!obs) throw notFound();
  if (obs.authorId !== principal.userId) throw forbidden('not_author');
  return obs;
}

async function applyTransition(tx: Tx, principal: Principal, obs: Obs, event: TransitionEvent, patch: Partial<Obs> = {}) {
  let to: ObservationState | null;
  try {
    to = nextState(obs.state, event, 'author');
  } catch (e) {
    if (e instanceof TransitionError) throw new HttpError(409, 'invalid_transition', e.message);
    throw e;
  }
  const [updated] = await tx
    .update(schema.observations)
    .set({ ...patch, state: to!, updatedAt: new Date() })
    .where(and(eq(schema.observations.id, obs.id), eq(schema.observations.state, obs.state)))
    .returning();
  if (!updated) throw new HttpError(409, 'concurrent_update');
  await audit(tx, { actorId: principal.userId, action: `observation.${event}`, resourceType: 'observation', resourceId: obs.id, tenantId: obs.tenantId, meta: { from: obs.state, to, version: updated.version } });
  await notify(tx, {
    userId: obs.authorId,
    type: 'observation_state',
    title: `“${obs.title}” — ${STATE_LABELS[to as ObservationState]}`,
    link: `/w/_/observations/${obs.id}`,
    dedupeKey: `obs:${obs.id}:v${updated.version}:${event}:${updated.updatedAt.getTime()}`,
  });
  return updated;
}

export async function listObservations(principalIn: Principal | null, tab: 'mine' | 'org') {
  const { principal, tenantId } = await tenantOf(principalIn, 'read');
  return withTenantTx(principal.userId, tenantId, async (tx) => {
    const where =
      tab === 'mine'
        ? eq(schema.observations.authorId, principal.userId)
        : and(ne(schema.observations.visibilityIntent, 'private'), ne(schema.observations.state, 'draft'));
    const list = await tx.select().from(schema.observations).where(where).orderBy(desc(schema.observations.updatedAt));
    return list.map((o) => toOwnObservationDTO(o, principal.userId));
  });
}

export async function getObservation(principalIn: Principal | null, id: string) {
  const { principal, tenantId } = await tenantOf(principalIn, 'read');
  return withTenantTx(principal.userId, tenantId, async (tx) => {
    const [obs] = await tx.select().from(schema.observations).where(eq(schema.observations.id, id)).limit(1);
    if (!obs) throw notFound(); // other tenants' records are invisible under RLS → 404, not a hint
    const isAuthor = obs.authorId === principal.userId;
    const reviews = isAuthor
      ? (await tx.select().from(schema.reviews).where(eq(schema.reviews.observationId, id)).orderBy(desc(schema.reviews.createdAt))).filter((r) => r.decision !== 'claim').map(toAuthorReviewDTO)
      : [];
    const [consent] = isAuthor ? await tx.select().from(schema.consents).where(eq(schema.consents.observationId, id)).orderBy(desc(schema.consents.createdAt)).limit(1) : [];
    const [shared] = await tx
      .select({ id: schema.sharedInsights.id, status: schema.sharedInsights.status, version: schema.sharedInsights.version, title: schema.sharedInsights.title, body: schema.sharedInsights.body, region: schema.sharedInsights.regionGeneralised, period: schema.sharedInsights.periodQuarter, attribution: schema.sharedInsights.attributionOrgName })
      .from(schema.sharedInsights)
      .where(eq(schema.sharedInsights.sourceObservationId, id))
      .limit(1);
    return {
      observation: toOwnObservationDTO(obs, principal.userId),
      sensitiveFlags: isAuthor ? obs.sensitiveFlags : [],
      reviews,
      consent: consent ? { storeProcess: consent.storeProcess, publishShared: consent.publishShared, attribution: consent.attribution, trainingProgramme: consent.trainingProgramme, version: consent.version, at: consent.createdAt.toISOString() } : null,
      sharedCopy: shared ?? null,
    };
  });
}

function draftValues(input: ObservationDraftInput) {
  return {
    type: input.type,
    offeringId: input.offeringId ?? null,
    industry: input.industry ?? null,
    region: input.region ?? null,
    topic: input.topic ?? null,
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    evidenceType: input.evidenceType ?? null,
    confidence: input.confidence,
    title: input.title,
    body: input.body,
  };
}

/** OBS-03: Save always creates a private draft visible only to its author. */
export async function createDraft(principalIn: Principal | null, raw: unknown) {
  const { principal, tenantId } = await tenantOf(principalIn, 'create');
  const input = observationDraftSchema.parse(raw);
  return withTenantTx(principal.userId, tenantId, async (tx) => {
    const [obs] = await tx
      .insert(schema.observations)
      .values({ ...draftValues(input), tenantId, authorId: principal.userId, state: 'draft', visibilityIntent: 'private' })
      .returning();
    await audit(tx, { actorId: principal.userId, action: 'observation.create_draft', resourceType: 'observation', resourceId: obs.id, tenantId });
    return toOwnObservationDTO(obs, principal.userId);
  });
}

/**
 * Edit. Drafts, returned and org-only items are edited in place.
 * A published item gets a new version that re-enters review (MOD-05); the existing shared copy
 * is untouched until a moderator approves the new version, and the audience never widens silently.
 */
export async function updateObservation(principalIn: Principal | null, id: string, raw: unknown) {
  const { principal, tenantId } = await tenantOf(principalIn, 'update');
  const input = observationDraftSchema.parse(raw);
  return withTenantTx(principal.userId, tenantId, async (tx) => {
    const obs = await loadOwn(tx, principal, id);
    if (['draft', 'returned', 'org_shared'].includes(obs.state)) {
      const [updated] = await tx.update(schema.observations).set({ ...draftValues(input), updatedAt: new Date() }).where(eq(schema.observations.id, id)).returning();
      await audit(tx, { actorId: principal.userId, action: 'observation.edit', resourceType: 'observation', resourceId: id, tenantId, meta: { state: obs.state } });
      return toOwnObservationDTO(updated, principal.userId);
    }
    if (obs.state === 'published') {
      const version = obs.version + 1;
      const [prevConsent] = await tx.select().from(schema.consents).where(eq(schema.consents.observationId, id)).orderBy(desc(schema.consents.createdAt)).limit(1);
      if (!prevConsent?.publishShared) throw forbidden('consent_required');
      await tx.insert(schema.consents).values({
        observationId: id, tenantId, version, actorId: principal.userId,
        storeProcess: prevConsent.storeProcess, publishShared: prevConsent.publishShared, attribution: prevConsent.attribution, trainingProgramme: prevConsent.trainingProgramme,
      });
      const updated = await applyTransition(tx, principal, obs, 'edit', { ...draftValues(input), version, sensitiveFlags: scanSensitive(input), claimedBy: null });
      return toOwnObservationDTO(updated, principal.userId);
    }
    throw new HttpError(409, 'not_editable', `Items in state '${obs.state}' cannot be edited.`);
  });
}

/**
 * Submit with an explicit sharing choice and four separate consents (OBS-04, SHR-02).
 * 'org' keeps the record inside the organisation and never enters moderation.
 * 'propose_shared' requires storing + publishing consent and goes to moderators.
 */
export async function submitObservation(principalIn: Principal | null, id: string, raw: unknown) {
  const { principal, tenantId } = await tenantOf(principalIn, 'submit');
  const { visibilityIntent, consents } = submitSchema.parse(raw);
  return withTenantTx(principal.userId, tenantId, async (tx) => {
    const obs = await loadOwn(tx, principal, id);
    const event: TransitionEvent = obs.state === 'returned' ? 'resubmit' : visibilityIntent === 'org' ? 'share_org' : 'submit';
    if (obs.state === 'returned' && visibilityIntent !== 'propose_shared') throw badRequest('returned_items_resubmit_to_review');
    await tx.insert(schema.consents).values({ observationId: id, tenantId, version: obs.version, actorId: principal.userId, ...consents });
    const flags = scanSensitive({ title: obs.title, body: obs.body });
    const updated = await applyTransition(tx, principal, obs, event, { visibilityIntent, sensitiveFlags: flags, claimedBy: null });
    if (updated.state === 'submitted') {
      const moderators = await tx.select({ userId: schema.grants.userId }).from(schema.grants).where(eq(schema.grants.grant, 'moderator'));
      for (const m of moderators) {
        await notify(tx, { userId: m.userId, type: 'moderation_queue', title: 'New contribution awaiting review', link: `/moderate/${id}`, dedupeKey: `modq:${id}:v${updated.version}:${m.userId}:${updated.updatedAt.getTime()}` });
      }
    }
    return { observation: toOwnObservationDTO(updated, principal.userId), flags: flags.length };
  });
}

export async function deleteDraft(principalIn: Principal | null, id: string) {
  const { principal, tenantId } = await tenantOf(principalIn, 'delete');
  await withTenantTx(principal.userId, tenantId, async (tx) => {
    const obs = await loadOwn(tx, principal, id);
    nextState(obs.state, 'delete', 'author');
    await tx.delete(schema.observations).where(and(eq(schema.observations.id, id), eq(schema.observations.state, 'draft')));
    await audit(tx, { actorId: principal.userId, action: 'observation.delete', resourceType: 'observation', resourceId: id, tenantId });
  });
}

export type WithdrawalReceipt = {
  observationId: string;
  sharedInsightId: string | null;
  steps: { step: string; ms: number }[];
  totalMs: number;
  committedAt: string;
};

/**
 * SHR-05 withdrawal, synchronously in ONE transaction:
 * shared copy → withdrawn; search documents deleted; retrieval blocklist entry; theme counts are computed
 * live from published copies only, so they update on commit; audit + notification.
 * The route then purges Next caches (revalidatePath). Already-viewed or copied material cannot be recalled.
 */
export async function withdrawObservation(principalIn: Principal | null, id: string): Promise<WithdrawalReceipt> {
  const { principal, tenantId } = await tenantOf(principalIn, 'withdraw');
  const t0 = performance.now();
  const steps: { step: string; ms: number }[] = [];
  const mark = (step: string) => steps.push({ step, ms: Math.round((performance.now() - t0) * 10) / 10 });
  const sharedId = await withTenantTx(principal.userId, tenantId, async (tx) => {
    const obs = await loadOwn(tx, principal, id);
    await applyTransition(tx, principal, obs, 'withdraw');
    mark('source_withdrawn');
    const [shared] = await tx
      .update(schema.sharedInsights)
      .set({ status: 'withdrawn', withdrawnAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.sharedInsights.sourceObservationId, id))
      .returning({ id: schema.sharedInsights.id });
    if (shared) {
      mark('feed_removed');
      await removeFromIndex(tx, shared.id, 'withdrawn');
      mark('search_index_purged');
      mark('aira_blocklisted');
      await audit(tx, { actorId: principal.userId, action: 'shared_insight.withdraw', resourceType: 'shared_insight', resourceId: shared.id, tenantId });
      mark('theme_counts_recomputed');
    }
    return shared?.id ?? null;
  });
  mark('committed');
  return { observationId: id, sharedInsightId: sharedId, steps, totalMs: steps[steps.length - 1].ms, committedAt: new Date().toISOString() };
}
