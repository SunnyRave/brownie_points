import type { schema } from '@/lib/db';

type SharedRow = typeof schema.sharedInsights.$inferSelect;
type ObservationRow = typeof schema.observations.$inferSelect;
type ReviewRow = typeof schema.reviews.$inferSelect;

/** Keys that must never appear in a shared payload (SHR-03, AT-09). */
export const FORBIDDEN_SHARED_KEYS = [
  'sourceObservationId', 'source_observation_id', 'sourceTenantId', 'source_tenant_id', 'tenantId', 'tenant_id',
  'authorId', 'author_id', 'author', 'authorName', 'authorEmail', 'attachments', 'internalNote', 'internal_note',
  'reviewerNotes', 'moderatorId', 'sensitiveFlags', 'redactionDiff',
] as const;

export type SharedInsightDTO = {
  id: string;
  version: number;
  type: string;
  title: string;
  body: string;
  offeringId: string | null;
  industry: string | null;
  region: string | null;
  period: string | null;
  topic: string | null;
  confidence: string | null;
  attribution: string | null;
  /** Reviewer-assessed evidence quality (moderator judgement, not a popularity score). */
  evidenceQuality: 'strong' | 'moderate' | 'limited' | null;
  publishedAt: string;
};

/** Explicit allow-list serialiser. Never spread a row into a response. */
export function toSharedInsightDTO(r: SharedRow): SharedInsightDTO {
  return {
    id: r.id,
    version: r.version,
    type: r.type,
    title: r.title,
    body: r.body,
    offeringId: r.offeringId,
    industry: r.industry,
    region: r.regionGeneralised,
    period: r.periodQuarter,
    topic: r.topic,
    confidence: r.confidence,
    attribution: r.attributionOrgName,
    evidenceQuality: r.evidenceQuality ?? null,
    publishedAt: r.publishedAt.toISOString(),
  };
}

/** The author's own view of their source record (never used for other tenants). */
export function toOwnObservationDTO(o: ObservationRow, viewerId: string) {
  return {
    id: o.id,
    version: o.version,
    type: o.type,
    offeringId: o.offeringId,
    industry: o.industry,
    region: o.region,
    topic: o.topic,
    periodStart: o.periodStart,
    periodEnd: o.periodEnd,
    evidenceType: o.evidenceType,
    confidence: o.confidence,
    title: o.title,
    body: o.body,
    visibilityIntent: o.visibilityIntent,
    state: o.state,
    isMine: o.authorId === viewerId,
    sensitiveFlagCount: o.sensitiveFlags.length,
    updatedAt: o.updatedAt.toISOString(),
  };
}
export type OwnObservationDTO = ReturnType<typeof toOwnObservationDTO>;

/** Author-facing review history: the reason only, never the moderator's internal note or identity. */
export function toAuthorReviewDTO(r: ReviewRow) {
  return { decision: r.decision, reason: r.authorReason, version: r.version, at: r.createdAt.toISOString() };
}
