import { pgTable, text, timestamp, boolean, integer, jsonb, primaryKey, uniqueIndex, index, date } from 'drizzle-orm/pg-core';
import type { Audience } from '@/lib/policy/types';

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ───────────────────────── Identity ─────────────────────────

export const organisations = pgTable('organisations', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  type: text('type', { enum: ['azentio', 'client'] }).notNull(),
  industry: text('industry'),
  region: text('region'),
  createdAt: createdAt(),
});

export const users = pgTable('users', {
  id: id(),
  entraOid: text('entra_oid').unique(),
  email: text('email').notNull().unique(), // lower-cased; display + magic-link target only, never an authority source
  name: text('name').notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id),
    orgId: text('org_id').notNull().references(() => organisations.id),
    role: text('role', { enum: ['employee', 'client_member', 'client_admin'] }).notNull(),
    status: text('status', { enum: ['active', 'pending', 'revoked'] }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('memberships_user_org').on(t.userId, t.orgId)],
);

export const grants = pgTable('grants', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id),
  grant: text('grant', {
    enum: ['moderator', 'content_publisher', 'product_owner', 'portal_admin', 'support_access'],
  }).notNull(),
  scopeOrgId: text('scope_org_id').references(() => organisations.id),
  scopeIdeaId: text('scope_idea_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  reason: text('reason'),
  grantedBy: text('granted_by'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const employeeAllowlist = pgTable('employee_allowlist', {
  id: id(),
  emailOrOid: text('email_or_oid').notNull().unique(),
  approvedBy: text('approved_by'),
  createdAt: createdAt(),
});

export const accessRequests = pgTable('access_requests', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id).unique(),
  status: text('status', { enum: ['pending', 'approved', 'denied'] }).notNull().default('pending'),
  createdAt: createdAt(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});

export const invitations = pgTable('invitations', {
  id: id(),
  orgId: text('org_id').notNull().references(() => organisations.id),
  email: text('email').notNull(),
  proposedRole: text('proposed_role', { enum: ['client_member', 'client_admin'] }).notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  invitedBy: text('invited_by').notNull(),
  status: text('status', { enum: ['pending', 'accepted', 'revoked'] }).notNull().default('pending'),
  createdAt: createdAt(),
});

export const sessions = pgTable('sessions', {
  id: id(),
  tokenHash: text('token_hash').notNull().unique(),
  userId: text('user_id').notNull().references(() => users.id),
  activeTenantId: text('active_tenant_id'),
  authMethod: text('auth_method', { enum: ['microsoft', 'magiclink'] }).notNull(),
  amr: jsonb('amr').$type<string[]>().notNull().default([]),
  authTime: timestamp('auth_time', { withTimezone: true }).notNull(),
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
  createdAt: createdAt(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const magicLinks = pgTable('magic_links', {
  id: id(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  purpose: text('purpose', { enum: ['signin', 'invite'] }).notNull(),
  invitationId: text('invitation_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const authAttempts = pgTable(
  'auth_attempts',
  { id: id(), key: text('key').notNull(), success: boolean('success').notNull().default(false), createdAt: createdAt() },
  (t) => [index('auth_attempts_key').on(t.key, t.createdAt)],
);

// ───────────────────────── Catalogue & content ─────────────────────────

export const offerings = pgTable('offerings', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  label: text('label').notNull().default(''),
  tagline: text('tagline').notNull().default(''),
  status: text('status').notNull().default('Prototype'),
  summary: text('summary').notNull(),
  description: text('description').notNull(),
  capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
  steps: jsonb('steps').$type<string[]>().notNull().default([]),
  outcomes: jsonb('outcomes').$type<string[]>().notNull().default([]),
  sortOrder: integer('sort_order').notNull().default(0),
  audience: jsonb('audience').$type<Audience | null>(),
  mediaIds: jsonb('media_ids').$type<string[]>().notNull().default([]),
});

export const entitlements = pgTable(
  'entitlements',
  {
    id: id(),
    orgId: text('org_id').notNull().references(() => organisations.id),
    offeringId: text('offering_id').notNull().references(() => offerings.id),
    sandboxEnabled: boolean('sandbox_enabled').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('entitlements_org_offering').on(t.orgId, t.offeringId)],
);

export const content = pgTable('content', {
  id: id(),
  type: text('type', {
    enum: ['page', 'banner', 'insight', 'media', 'release_note', 'library', 'experiment', 'briefing'],
  }).notNull(),
  slug: text('slug'),
  title: text('title').notNull(),
  summary: text('summary'),
  body: text('body').notNull().default(''),
  audience: jsonb('audience').$type<Audience | null>(),
  ownerId: text('owner_id'),
  reviewDate: date('review_date'),
  status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('published'),
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const media = pgTable('media', {
  id: id(),
  title: text('title').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  audience: jsonb('audience').$type<Audience | null>(),
  storageKey: text('storage_key').notNull(),
  createdAt: createdAt(),
});

export const broadcasts = pgTable('broadcasts', {
  id: id(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  audience: jsonb('audience').$type<Audience | null>(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  status: text('status', { enum: ['scheduled', 'live', 'ended'] }).notNull().default('scheduled'),
  recordingMediaId: text('recording_media_id'),
  createdBy: text('created_by'),
  updatedAt: updatedAt(),
});

// ───────────────────────── Collective learning ─────────────────────────

export const observations = pgTable('observations', {
  id: id(),
  tenantId: text('tenant_id').notNull().references(() => organisations.id),
  authorId: text('author_id').notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  type: text('type', {
    enum: ['market_observation', 'trend', 'product_gap', 'operational_challenge', 'successful_practice', 'suggestion'],
  }).notNull(),
  offeringId: text('offering_id'),
  industry: text('industry'),
  region: text('region'),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  evidenceType: text('evidence_type'),
  confidence: text('confidence', { enum: ['low', 'medium', 'high'] }).notNull().default('medium'),
  topic: text('topic'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  visibilityIntent: text('visibility_intent', { enum: ['private', 'org', 'propose_shared'] }).notNull().default('private'),
  state: text('state').notNull().default('draft'),
  sensitiveFlags: jsonb('sensitive_flags').$type<SensitiveFlag[]>().notNull().default([]),
  claimedBy: text('claimed_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type SensitiveFlag = { kind: string; match: string; start: number; end: number; field: 'title' | 'body' };

export const consents = pgTable('consents', {
  id: id(),
  observationId: text('observation_id').notNull().references(() => observations.id),
  tenantId: text('tenant_id').notNull(),
  version: integer('version').notNull(),
  storeProcess: boolean('store_process').notNull(),
  publishShared: boolean('publish_shared').notNull(),
  attribution: boolean('attribution').notNull(),
  trainingProgramme: boolean('training_programme').notNull(),
  actorId: text('actor_id').notNull(),
  createdAt: createdAt(),
});

export const reviews = pgTable('reviews', {
  id: id(),
  observationId: text('observation_id').notNull().references(() => observations.id),
  tenantId: text('tenant_id').notNull(),
  version: integer('version').notNull(),
  moderatorId: text('moderator_id').notNull(),
  decision: text('decision', { enum: ['claim', 'return', 'reject', 'approve'] }).notNull(),
  authorReason: text('author_reason'),
  internalNote: text('internal_note'), // never leaves moderation endpoints
  redactionDiff: jsonb('redaction_diff').$type<Record<string, { from: string | null; to: string | null }>>(),
  createdAt: createdAt(),
});

export const sharedInsights = pgTable('shared_insights', {
  id: id(),
  sourceObservationId: text('source_observation_id').notNull().unique(), // server-only, never serialised
  sourceTenantId: text('source_tenant_id').notNull(), // server-only: used for distinct-org counts only
  version: integer('version').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  offeringId: text('offering_id'),
  industry: text('industry'),
  regionGeneralised: text('region_generalised'),
  periodQuarter: text('period_quarter'),
  topic: text('topic'),
  confidence: text('confidence'),
  attributionOrgName: text('attribution_org_name'),
  status: text('status', { enum: ['published', 'unpublished', 'withdrawn', 'removed'] }).notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  updatedAt: updatedAt(),
});

export const reports = pgTable('reports', {
  id: id(),
  sharedInsightId: text('shared_insight_id').notNull().references(() => sharedInsights.id),
  reporterId: text('reporter_id').notNull(),
  reason: text('reason', { enum: ['misleading', 'confidential', 'inappropriate', 'other'] }).notNull(),
  details: text('details'),
  status: text('status', { enum: ['open', 'resolved'] }).notNull().default('open'),
  decision: text('decision'),
  decidedBy: text('decided_by'),
  createdAt: createdAt(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});

export const themes = pgTable('themes', {
  id: id(),
  name: text('name').notNull(),
  summary: text('summary').notNull(),
  offeringIds: jsonb('offering_ids').$type<string[]>().notNull().default([]),
  limitations: text('limitations').notNull().default(''),
  updatedAt: updatedAt(),
});

export const themeLinks = pgTable(
  'theme_links',
  {
    themeId: text('theme_id').notNull().references(() => themes.id),
    sharedInsightId: text('shared_insight_id').notNull().references(() => sharedInsights.id),
  },
  (t) => [primaryKey({ columns: [t.themeId, t.sharedInsightId] })],
);

export const ideas = pgTable('ideas', {
  id: id(),
  title: text('title').notNull(),
  problem: text('problem').notNull(),
  offeringId: text('offering_id'),
  proposedOutcome: text('proposed_outcome').notNull(),
  ownerTeam: text('owner_team').notNull(),
  ownerId: text('owner_id'),
  priority: text('priority', { enum: ['low', 'medium', 'high'] }).notNull().default('medium'),
  status: text('status', {
    enum: ['proposed', 'under_review', 'planned', 'in_progress', 'released', 'not_proceeding'],
  }).notNull().default('proposed'),
  publicUpdate: text('public_update').notNull().default(''),
  internalNotes: text('internal_notes').notNull().default(''), // never shown to clients
  createdBy: text('created_by').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const ideaEvidence = pgTable(
  'idea_evidence',
  {
    ideaId: text('idea_id').notNull().references(() => ideas.id),
    sharedInsightId: text('shared_insight_id').notNull().references(() => sharedInsights.id),
  },
  (t) => [primaryKey({ columns: [t.ideaId, t.sharedInsightId] })],
);

// ───────────────────────── Search, notifications, audit ─────────────────────────

export const searchDocuments = pgTable(
  'search_documents',
  {
    id: id(),
    audienceKey: text('audience_key').notNull(), // 'public' | 'shared_community' | 'employee' | 'tenant:<id>'
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    title: text('title').notNull(),
    text: text('text').notNull(),
    url: text('url').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [index('search_documents_audience').on(t.audienceKey), uniqueIndex('search_documents_source').on(t.sourceType, t.sourceId)],
);

export const retrievalBlocklist = pgTable('retrieval_blocklist', {
  sourceId: text('source_id').primaryKey(),
  reason: text('reason').notNull(),
  createdAt: createdAt(),
});

export const notifications = pgTable('notifications', {
  id: id(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  link: text('link'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const outbox = pgTable('outbox', {
  id: id(),
  channel: text('channel', { enum: ['inapp', 'email'] }).notNull(),
  dedupeKey: text('dedupe_key').notNull().unique(),
  recipient: text('recipient').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: text('status', { enum: ['queued', 'sent', 'delivered', 'failed'] }).notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const auditEvents = pgTable(
  'audit_events',
  {
    id: id(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    tenantId: text('tenant_id'),
    decision: text('decision', { enum: ['allow', 'deny'] }).notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('audit_events_created').on(t.createdAt)],
);

export const playgroundRuns = pgTable('playground_runs', {
  id: id(),
  userId: text('user_id').notNull(),
  tenantId: text('tenant_id'),
  offeringId: text('offering_id').notNull(),
  scenarioId: text('scenario_id').notNull(),
  inputs: jsonb('inputs').$type<Record<string, number>>().notNull(),
  outputs: jsonb('outputs').$type<Record<string, unknown>>().notNull(),
  feedback: jsonb('feedback').$type<Record<string, unknown> | null>(),
  createdAt: createdAt(),
});

// ───────────────────────── Public forms ─────────────────────────

export const leads = pgTable('leads', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company').notNull(),
  offeringInterest: text('offering_interest'),
  message: text('message'),
  consent: boolean('consent').notNull(),
  createdAt: createdAt(),
});

export const events = pgTable('events', {
  id: id(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  capacity: integer('capacity').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
});

export const eventRegistrations = pgTable(
  'event_registrations',
  {
    id: id(),
    eventId: text('event_id').notNull().references(() => events.id),
    name: text('name').notNull(),
    email: text('email').notNull(),
    team: text('team'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('event_registrations_unique').on(t.eventId, t.email)],
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
});
