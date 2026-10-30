import { z } from 'zod';

/** One schema set for client forms and server handlers (OBS-02). */

export const OBSERVATION_TYPES = ['market_observation', 'trend', 'product_gap', 'operational_challenge', 'successful_practice', 'suggestion'] as const;
export const OBSERVATION_TYPE_LABELS: Record<(typeof OBSERVATION_TYPES)[number], string> = {
  market_observation: 'Market observation',
  trend: 'Emerging trend',
  product_gap: 'Product gap',
  operational_challenge: 'Operational challenge',
  successful_practice: 'Successful practice',
  suggestion: 'Improvement suggestion',
};
export const EVIDENCE_TYPES = ['Portfolio review', 'Customer interviews', 'Operational metrics', 'Market research', 'Regulatory update', 'Anecdotal'] as const;
export const INDUSTRIES = ['Banking', 'Credit unions', 'Consumer finance', 'Insurance', 'SME lending'] as const;
export const REGIONS = ['Europe', 'Middle East', 'Africa', 'Asia Pacific', 'North America', 'Latin America'] as const;
export const TOPICS = ['Seasonality', 'Document handling', 'Regulatory change', 'Risk models', 'Customer onboarding', 'Data quality'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const observationDraftSchema = z
  .object({
    type: z.enum(OBSERVATION_TYPES),
    offeringId: z.string().max(64).nullable().optional(),
    industry: z.enum(INDUSTRIES).nullable().optional(),
    region: z.string().trim().max(80).nullable().optional(),
    topic: z.enum(TOPICS).nullable().optional(),
    periodStart: isoDate.nullable().optional(),
    periodEnd: isoDate.nullable().optional(),
    evidenceType: z.enum(EVIDENCE_TYPES).nullable().optional(),
    confidence: z.enum(['low', 'medium', 'high']),
    title: z.string().trim().min(8, 'At least 8 characters').max(140, 'At most 140 characters'),
    body: z.string().trim().min(40, 'At least 40 characters').max(4000, 'At most 4000 characters'),
  })
  .refine((v) => !v.periodStart || !v.periodEnd || v.periodStart <= v.periodEnd, { message: 'Period end must be after start', path: ['periodEnd'] });
export type ObservationDraftInput = z.infer<typeof observationDraftSchema>;

export const consentSchema = z.object({
  storeProcess: z.boolean(),
  publishShared: z.boolean(),
  attribution: z.boolean(),
  trainingProgramme: z.boolean(),
});

export const submitSchema = z
  .object({ visibilityIntent: z.enum(['org', 'propose_shared']), consents: consentSchema })
  .refine((v) => v.consents.storeProcess, { message: 'Storing and processing consent is required to submit', path: ['consents', 'storeProcess'] })
  .refine((v) => v.visibilityIntent !== 'propose_shared' || v.consents.publishShared, {
    message: 'Proposing to the community requires consent to publish a reviewed shared version',
    path: ['consents', 'publishShared'],
  });

export const moderationDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('return'), authorReason: z.string().trim().min(10).max(1000), internalNote: z.string().max(2000).optional() }),
  z.object({
    decision: z.literal('reject'),
    category: z.enum(['duplicate', 'unsafe', 'out_of_scope']),
    authorReason: z.string().trim().min(10).max(1000),
    internalNote: z.string().max(2000).optional(),
  }),
  z.object({
    decision: z.literal('approve'),
    authorReason: z.string().trim().min(5).max(1000),
    internalNote: z.string().max(2000).optional(),
    shared: z.object({
      title: z.string().trim().min(8).max(140),
      body: z.string().trim().min(40).max(4000),
      regionGeneralised: z.string().trim().max(80).nullable(),
      periodQuarter: z.string().trim().max(40).nullable(),
      topic: z.enum(TOPICS).nullable(),
      showAttribution: z.boolean(),
      themeId: z.string().max(64).nullable().optional(),
    }),
  }),
]);

export const reportSchema = z.object({ reason: z.enum(['misleading', 'confidential', 'inappropriate', 'other']), details: z.string().trim().max(1000).optional() });
export const reportDecisionSchema = z.object({ decision: z.enum(['unpublish', 'restore', 'remove', 'dismiss']), note: z.string().trim().min(5).max(1000) });

export const IDEA_STATUSES = ['proposed', 'under_review', 'planned', 'in_progress', 'released', 'not_proceeding'] as const;
export const IDEA_STATUS_LABELS: Record<(typeof IDEA_STATUSES)[number], string> = {
  proposed: 'Proposed',
  under_review: 'Under review',
  planned: 'Planned',
  in_progress: 'In progress',
  released: 'Released',
  not_proceeding: 'Not proceeding',
};
export const ideaCreateSchema = z.object({
  title: z.string().trim().min(8).max(140),
  problem: z.string().trim().min(20).max(2000),
  offeringId: z.string().max(64).nullable(),
  proposedOutcome: z.string().trim().min(10).max(2000),
  ownerTeam: z.string().trim().min(2).max(80),
  priority: z.enum(['low', 'medium', 'high']),
  evidenceIds: z.array(z.string().max(64)).max(50),
});
export const ideaStatusSchema = z.object({
  status: z.enum(IDEA_STATUSES),
  publicUpdate: z.string().trim().min(10).max(1000),
  internalNotes: z.string().max(4000).optional(),
});

export const CLIENT_ROLES = ['client_member', 'client_admin'] as const;
export const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), role: z.string().max(40) });
export const roleChangeSchema = z.object({ role: z.string().max(40) });

export const leadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  company: z.string().trim().min(2).max(160),
  offeringInterest: z.string().max(64).optional().nullable(),
  message: z.string().trim().max(2000).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required so we can contact you' }) }),
  website: z.string().max(0, 'Spam detected').optional(), // honeypot
  startedAt: z.number().int(), // time-trap: humans take > 2 s
});

export const eventRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  team: z.string().trim().max(120).optional(),
  website: z.string().max(0).optional(),
});

export const magicLinkRequestSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

export const grantSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  grant: z.enum(['moderator', 'content_publisher', 'product_owner', 'portal_admin', 'support_access']),
  scopeOrgId: z.string().max(64).nullable().optional(),
  scopeIdeaId: z.string().max(64).nullable().optional(),
  expiresInHours: z.number().int().min(1).max(24 * 365).nullable().optional(),
  reason: z.string().trim().min(5).max(500),
});

export const bannerSchema = z.object({ title: z.string().trim().min(4).max(120), body: z.string().trim().max(300), ctaLabel: z.string().max(40).optional(), ctaHref: z.string().max(200).optional() });
export const broadcastSchema = z.object({
  title: z.string().trim().min(4).max(140),
  description: z.string().trim().max(1000),
  startsAt: z.string().min(10),
  audience: z.enum(['employee', 'public', 'shared_community']).or(z.string().regex(/^tenant:[\w-]+$/)),
  status: z.enum(['scheduled', 'live', 'ended']),
});
