import { and, desc, eq, inArray } from 'drizzle-orm';
import { schema, withModeratorTx, withSystemTx, type Tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/outbox';
import { enforce } from '@/lib/policy/enforce';
import { HttpError, notFound } from '@/lib/http';
import { generalisePeriod, generaliseRegion, suggestRedaction } from '@/lib/scan';
import { indexDocument, removeFromIndex } from '@/lib/search';
import { nextState, TransitionError, STATE_LABELS, type ObservationState, type TransitionEvent } from '@/lib/learning/stateMachine';
import { moderationDecisionSchema, reportDecisionSchema, reportSchema } from '@/lib/validation';
import type { Principal } from '@/lib/policy/types';
import { notifyThemeSubscribers } from '@/lib/services/engagement';

const queueResource = { type: 'moderation_queue', audience: { kind: 'grant' as const, grant: 'moderator' as const } };
type Obs = typeof schema.observations.$inferSelect;

async function moderatorTransition(tx: Tx, moderatorId: string, obs: Obs, event: TransitionEvent, notifyText?: string) {
  let to: ObservationState | null;
  try {
    to = nextState(obs.state, event, 'moderator');
  } catch (e) {
    if (e instanceof TransitionError) throw new HttpError(409, 'invalid_transition', e.message);
    throw e;
  }
  const [updated] = await tx
    .update(schema.observations)
    .set({ state: to!, updatedAt: new Date(), claimedBy: event === 'claim' ? moderatorId : obs.claimedBy })
    .where(and(eq(schema.observations.id, obs.id), eq(schema.observations.state, obs.state)))
    .returning();
  if (!updated) throw new HttpError(409, 'concurrent_update');
  await audit(tx, { actorId: moderatorId, action: `moderation.${event}`, resourceType: 'observation', resourceId: obs.id, tenantId: obs.tenantId, meta: { from: obs.state, to, version: obs.version } });
  if (event !== 'claim') {
    await notify(tx, {
      userId: obs.authorId,
      type: 'moderation_decision',
      title: `“${obs.title}” — ${STATE_LABELS[to as ObservationState]}`,
      body: notifyText ?? '',
      link: `/w/_/observations/${obs.id}`,
      dedupeKey: `mod:${obs.id}:v${obs.version}:${event}:${updated.updatedAt.getTime()}`,
    });
  }
  return updated;
}

/** MOD-01: submitted / in_review / under_report only. RLS additionally hides drafts, private and org-only items. */
export async function listQueue(principal: Principal | null) {
  await enforce(principal, 'moderate', queueResource);
  return withModeratorTx(principal!.userId, async (tx) => {
    const items = await tx
      .select({ id: schema.observations.id, title: schema.observations.title, type: schema.observations.type, state: schema.observations.state, version: schema.observations.version, flags: schema.observations.sensitiveFlags, updatedAt: schema.observations.updatedAt, topic: schema.observations.topic })
      .from(schema.observations)
      .where(inArray(schema.observations.state, ['submitted', 'in_review', 'under_report']))
      .orderBy(desc(schema.observations.updatedAt));
    return items.map((i) => ({ ...i, flagCount: i.flags.length, flags: undefined }));
  });
}

export async function getReviewItem(principal: Principal | null, id: string) {
  await enforce(principal, 'moderate', { ...queueResource, id });
  return withModeratorTx(principal!.userId, async (tx) => {
    let [obs] = await tx.select().from(schema.observations).where(eq(schema.observations.id, id)).limit(1);
    if (!obs) throw notFound();
    if (obs.state === 'submitted') obs = await moderatorTransition(tx, principal!.userId, obs, 'claim');
    const [consent] = await tx.select().from(schema.consents).where(and(eq(schema.consents.observationId, id), eq(schema.consents.version, obs.version))).orderBy(desc(schema.consents.createdAt)).limit(1);
    const history = await tx.select().from(schema.reviews).where(eq(schema.reviews.observationId, id)).orderBy(desc(schema.reviews.createdAt));
    const [shared] = await tx.select().from(schema.sharedInsights).where(eq(schema.sharedInsights.sourceObservationId, id)).limit(1);
    const themes = await tx.select({ id: schema.themes.id, name: schema.themes.name }).from(schema.themes);
    // Organisation name is revealed to moderators only when the author opted in to attribution.
    let attributionOrg: string | null = null;
    if (consent?.attribution) {
      const [org] = await tx.select({ name: schema.organisations.name }).from(schema.organisations).where(eq(schema.organisations.id, obs.tenantId));
      attributionOrg = org?.name ?? null;
    }
    const suggestedTheme = themes.find((t) => obs.topic && t.name.toLowerCase().includes(obs.topic.toLowerCase().slice(0, 6))) ?? null;
    return {
      original: {
        id: obs.id, version: obs.version, state: obs.state, type: obs.type, title: obs.title, body: obs.body, region: obs.region,
        industry: obs.industry, topic: obs.topic, periodStart: obs.periodStart, periodEnd: obs.periodEnd, evidenceType: obs.evidenceType,
        confidence: obs.confidence, offeringId: obs.offeringId, flags: obs.sensitiveFlags,
      },
      consent: consent ? { storeProcess: consent.storeProcess, publishShared: consent.publishShared, attribution: consent.attribution, trainingProgramme: consent.trainingProgramme } : null,
      attributionOrg,
      suggestion: {
        title: suggestRedaction(obs.title),
        body: suggestRedaction(obs.body),
        regionGeneralised: generaliseRegion(obs.region),
        periodQuarter: generalisePeriod(obs.periodStart, obs.periodEnd),
        topic: obs.topic,
        themeId: suggestedTheme?.id ?? null,
      },
      currentShared: shared ? { status: shared.status, version: shared.version, title: shared.title, body: shared.body } : null,
      history: history.map((h) => ({ decision: h.decision, authorReason: h.authorReason, internalNote: h.internalNote, version: h.version, at: h.createdAt.toISOString(), mine: h.moderatorId === principal!.userId })),
      themes,
    };
  });
}

function diff(original: Record<string, string | null>, shared: Record<string, string | null>) {
  const out: Record<string, { from: string | null; to: string | null }> = {};
  for (const k of Object.keys(shared)) if ((original[k] ?? null) !== (shared[k] ?? null)) out[k] = { from: original[k] ?? null, to: shared[k] ?? null };
  return out;
}

/** MOD-03: every decision carries an author-facing reason. Internal notes never leave moderation. */
export async function decide(principal: Principal | null, id: string, raw: unknown) {
  await enforce(principal, 'moderate', { ...queueResource, id });
  const input = moderationDecisionSchema.parse(raw);
  const moderatorId = principal!.userId;
  const result = await withModeratorTx(moderatorId, async (tx) => {
    let [obs] = await tx.select().from(schema.observations).where(eq(schema.observations.id, id)).limit(1);
    if (!obs) throw notFound();
    if (obs.state === 'submitted') obs = await moderatorTransition(tx, moderatorId, obs, 'claim');

    if (input.decision === 'return' || input.decision === 'reject') {
      await tx.insert(schema.reviews).values({ observationId: id, tenantId: obs.tenantId, version: obs.version, moderatorId, decision: input.decision, authorReason: input.decision === 'reject' ? `[${input.category.replace('_', ' ')}] ${input.authorReason}` : input.authorReason, internalNote: input.internalNote ?? null });
      await moderatorTransition(tx, moderatorId, obs, input.decision, input.authorReason);
      return { state: input.decision === 'return' ? 'returned' : 'rejected' } as { state: string; sharedInsightId?: string; themeId?: string | null; authorId?: string };
    }

    // approve
    const [consent] = await tx.select().from(schema.consents).where(and(eq(schema.consents.observationId, id), eq(schema.consents.version, obs.version))).orderBy(desc(schema.consents.createdAt)).limit(1);
    if (!consent?.storeProcess || !consent.publishShared) throw new HttpError(409, 'consent_missing', 'The author has not consented to publishing a shared version.');
    const s = input.shared;
    let attributionOrgName: string | null = null;
    if (s.showAttribution) {
      if (!consent.attribution) throw new HttpError(409, 'attribution_not_consented', 'Attribution requires the author’s opt-in.');
      const [org] = await tx.select({ name: schema.organisations.name }).from(schema.organisations).where(eq(schema.organisations.id, obs.tenantId));
      attributionOrgName = org.name;
    }
    const sharedValues = {
      version: obs.version, type: obs.type, title: s.title, body: s.body, offeringId: obs.offeringId, industry: obs.industry,
      regionGeneralised: s.regionGeneralised, periodQuarter: s.periodQuarter, topic: s.topic, confidence: obs.confidence,
      attributionOrgName, evidenceQuality: input.evidenceQuality ?? null, status: 'published' as const, publishedAt: new Date(), withdrawnAt: null, updatedAt: new Date(),
    };
    // Only reviewed fields are copied. No author, tenant, attachments or hidden metadata.
    const [shared] = await tx
      .insert(schema.sharedInsights)
      .values({ ...sharedValues, sourceObservationId: obs.id, sourceTenantId: obs.tenantId })
      .onConflictDoUpdate({ target: schema.sharedInsights.sourceObservationId, set: sharedValues })
      .returning();
    if (s.themeId) await tx.insert(schema.themeLinks).values({ themeId: s.themeId, sharedInsightId: shared.id }).onConflictDoNothing();
    if (s.themeId) await tx.update(schema.themes).set({ updatedAt: new Date() }).where(eq(schema.themes.id, s.themeId));
    await indexDocument(tx, { audienceKey: 'shared_community', sourceType: 'shared_insight', sourceId: shared.id, title: s.title, text: s.body, url: `/community/${shared.id}` });
    const redactionDiff = diff(
      { title: obs.title, body: obs.body, region: obs.region, period: `${obs.periodStart ?? ''}..${obs.periodEnd ?? ''}`, topic: obs.topic },
      { title: s.title, body: s.body, region: s.regionGeneralised, period: s.periodQuarter, topic: s.topic },
    );
    await tx.insert(schema.reviews).values({ observationId: id, tenantId: obs.tenantId, version: obs.version, moderatorId, decision: 'approve', authorReason: input.authorReason, internalNote: input.internalNote ?? null, redactionDiff });
    await audit(tx, { actorId: moderatorId, action: 'shared_insight.publish', resourceType: 'shared_insight', resourceId: shared.id, meta: { version: obs.version, attribution: !!attributionOrgName, theme: s.themeId ?? null } });
    await moderatorTransition(tx, moderatorId, obs, 'approve', input.authorReason);
    return { state: 'published', sharedInsightId: shared.id, themeId: s.themeId ?? null, authorId: obs.authorId };
  });
  // Theme subscribers hear about it after commit, with a k-safe message (theme_subscriptions is owner/system-only under RLS).
  if (result.sharedInsightId && result.themeId) {
    await notifyThemeSubscribers(result.themeId, result.sharedInsightId, result.authorId ?? null).catch((e) => console.error('theme subscriber notification failed', e));
  }
  return { state: result.state, ...(result.sharedInsightId ? { sharedInsightId: result.sharedInsightId } : {}) };
}

// ───────── Reports (MOD-04) ─────────

/** Any authorised community participant may report; the contributor is never told who reported. */
export async function reportSharedInsight(principal: Principal | null, sharedId: string, raw: unknown) {
  await enforce(principal, 'report', { type: 'shared_insight', id: sharedId, audience: { kind: 'shared_community' } });
  const input = reportSchema.parse(raw);
  return withSystemTx(async (tx) => {
    const [shared] = await tx.select().from(schema.sharedInsights).where(and(eq(schema.sharedInsights.id, sharedId), eq(schema.sharedInsights.status, 'published'))).limit(1);
    if (!shared) throw notFound();
    const [report] = await tx.insert(schema.reports).values({ sharedInsightId: sharedId, reporterId: principal!.userId, reason: input.reason, details: input.details ?? null }).returning();
    const [obs] = await tx.select().from(schema.observations).where(eq(schema.observations.id, shared.sourceObservationId));
    if (obs?.state === 'published') {
      await tx.update(schema.observations).set({ state: nextState(obs.state, 'report', 'reporter')!, updatedAt: new Date() }).where(eq(schema.observations.id, obs.id));
    }
    const moderators = await tx.select({ userId: schema.grants.userId }).from(schema.grants).where(eq(schema.grants.grant, 'moderator'));
    for (const m of moderators) await notify(tx, { userId: m.userId, type: 'report', title: `Report: ${input.reason}`, link: '/moderate/reports', dedupeKey: `report:${report.id}:${m.userId}` });
    await audit(tx, { actorId: principal!.userId, action: 'shared_insight.report', resourceType: 'report', resourceId: report.id, meta: { sharedInsightId: sharedId, reason: input.reason } });
    return { reportId: report.id };
  });
}

export async function listReports(principal: Principal | null) {
  await enforce(principal, 'moderate', queueResource);
  return withSystemTx(async (tx) =>
    tx
      .select({ id: schema.reports.id, reason: schema.reports.reason, details: schema.reports.details, status: schema.reports.status, decision: schema.reports.decision, createdAt: schema.reports.createdAt, sharedInsightId: schema.sharedInsights.id, sharedTitle: schema.sharedInsights.title, sharedBody: schema.sharedInsights.body, sharedStatus: schema.sharedInsights.status })
      .from(schema.reports)
      .innerJoin(schema.sharedInsights, eq(schema.sharedInsights.id, schema.reports.sharedInsightId))
      .orderBy(desc(schema.reports.createdAt)),
  );
}

export async function decideReport(principal: Principal | null, reportId: string, raw: unknown) {
  await enforce(principal, 'moderate', { ...queueResource, id: reportId });
  const input = reportDecisionSchema.parse(raw);
  const moderatorId = principal!.userId;
  return withModeratorTx(moderatorId, async (tx) => {
    const [report] = await tx.select().from(schema.reports).where(eq(schema.reports.id, reportId)).limit(1);
    if (!report) throw notFound();
    const [shared] = await tx.select().from(schema.sharedInsights).where(eq(schema.sharedInsights.id, report.sharedInsightId));
    const [obs] = await tx.select().from(schema.observations).where(eq(schema.observations.id, shared.sourceObservationId));
    const sharedStatus = { unpublish: 'unpublished', remove: 'removed', restore: 'published', dismiss: 'published' }[input.decision] as 'published' | 'unpublished' | 'removed';
    if (shared.status === 'withdrawn') throw new HttpError(409, 'already_withdrawn');
    await tx.update(schema.sharedInsights).set({ status: sharedStatus, updatedAt: new Date() }).where(eq(schema.sharedInsights.id, shared.id));
    if (sharedStatus === 'published') {
      await indexDocument(tx, { audienceKey: 'shared_community', sourceType: 'shared_insight', sourceId: shared.id, title: shared.title, text: shared.body, url: `/community/${shared.id}` });
    } else {
      await removeFromIndex(tx, shared.id, sharedStatus);
    }
    if (obs && ['under_report', 'unpublished'].includes(obs.state)) {
      await moderatorTransition(tx, moderatorId, obs, input.decision as TransitionEvent, input.note);
    } else if (obs) {
      await notify(tx, { userId: obs.authorId, type: 'moderation_decision', title: `Shared copy of “${obs.title}”: ${sharedStatus}`, body: input.note, link: `/w/_/observations/${obs.id}`, dedupeKey: `report-decision:${reportId}:${input.decision}` });
    }
    const keepOpen = input.decision === 'unpublish';
    await tx.update(schema.reports).set({ status: keepOpen ? 'open' : 'resolved', decision: `${input.decision}: ${input.note}`, decidedBy: moderatorId, decidedAt: new Date() }).where(eq(schema.reports.id, reportId));
    await audit(tx, { actorId: moderatorId, action: `report.${input.decision}`, resourceType: 'report', resourceId: reportId, meta: { sharedInsightId: shared.id } });
    return { sharedStatus };
  });
}
