import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { schema, type Db, type Tx } from '@/lib/db';
import { rows } from '@/lib/db/rows';
import { scanSensitive } from '@/lib/scan';
import type { Audience } from '@/lib/policy/types';
import { ABOUT, HOME, INSIGHTS, LAB, MEDIA, PRODUCTS, SOLUTIONS, TECHNOLOGY } from './azentio-catalogue';

/**
 * 100% synthetic. All organisations, people and customers are fictional; emails use the reserved
 * .example TLD (clients) or the azentio.com domain for synthetic employee test identities.
 */

const pub: Audience = { kind: 'public' };
const emp: Audience = { kind: 'employee' };

export const DEMO_USERS = {
  employee: 'alex.employee@azentio.com',
  publisher: 'priya.publisher@azentio.com',
  moderator: 'maya.moderator@azentio.com',
  owner: 'omar.owner@azentio.com',
  admin: 'ada.admin@azentio.com',
  pending: 'sam.pending@azentio.com',
  northwindAdmin: 'nina.admin@northwind.example',
  northwindMember: 'noah.analyst@northwind.example',
  harborAdmin: 'hana.admin@harbor.example',
  harborMember: 'hugo.analyst@harbor.example',
  meridianAdmin: 'mia.admin@meridian.example',
  meridianMember: 'max.analyst@meridian.example',
  consultant: 'cara.consultant@advisory.example',
} as const;

const CLIENT_ORGS = [
  { slug: 'northwind', name: 'Northwind Bank', industry: 'Banking', region: 'Europe' },
  { slug: 'harbor', name: 'Harbor Credit Union', industry: 'Credit unions', region: 'North America' },
  { slug: 'meridian', name: 'Meridian Finance', industry: 'SME lending', region: 'Middle East' },
  { slug: 'cedar', name: 'Cedar Mutual', industry: 'Banking', region: 'Europe' },
  { slug: 'atlas', name: 'Atlas Lending', industry: 'SME lending', region: 'Asia Pacific' },
  { slug: 'bluewater', name: 'Bluewater Savings', industry: 'Consumer finance', region: 'Africa' },
];

const MEDIA_FILES: Record<string, string> = {
  'townhall-q4.svg': svgCard('Q4 Product Town Hall', 'Employee-only recording · synthetic', '#F5B44A'),
  'northwind-briefing.svg': svgCard('Northwind briefing', 'Client-only webinar recording · synthetic', '#7C5CFF'),
};

function svgCard(title: string, sub: string, color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><defs><radialGradient id="g" cx="30%" cy="30%"><stop offset="0" stop-color="${color}" stop-opacity=".55"/><stop offset="1" stop-color="#050816"/></radialGradient></defs><rect width="1280" height="720" fill="#050816"/><rect width="1280" height="720" fill="url(#g)"/><text x="80" y="340" font-family="Space Grotesk, Arial" font-size="64" font-weight="700" fill="#E8ECF7">${title}</text><text x="80" y="410" font-family="Inter, Arial" font-size="30" fill="#C3CAE0">${sub}</text><circle cx="1110" cy="560" r="60" fill="none" stroke="${color}" stroke-width="6"/><path d="M1095 530 L1140 560 L1095 590 Z" fill="${color}"/></svg>`;
}

export async function seedIfEmpty(db: Db) {
  const existing = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from organisations`));
  if ((existing[0]?.n ?? 0) > 0) return false;
  await seed(db);
  return true;
}

const TABLES = [
  'contribution_feedback', 'comment_reports', 'comments', 'bookmarks', 'saved_searches', 'theme_subscriptions',
  'support_ticket_messages', 'support_tickets', 'observation_attachments', 'team_space_posts', 'team_space_members', 'team_spaces',
  'fl_models', 'fl_rounds', 'fl_participants',
  'theme_links', 'idea_evidence', 'reports', 'themes', 'ideas', 'reviews', 'consents', 'shared_insights', 'observations',
  'search_documents', 'retrieval_blocklist', 'notifications', 'outbox', 'audit_events', 'playground_runs', 'leads',
  'event_registrations', 'events', 'broadcasts', 'media', 'content', 'entitlements', 'offerings', 'sessions', 'magic_links',
  'auth_attempts', 'invitations', 'grants', 'access_requests', 'employee_allowlist', 'memberships', 'users', 'organisations', 'settings',
];

export async function resetAndSeed(db: Db) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.mode', 'system', true)`);
    await tx.execute(sql.raw(`truncate ${TABLES.join(', ')} cascade`));
  });
  await seed(db);
}

async function seed(db: Db) {
  const mediaDir = path.join(process.cwd(), 'storage', 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  for (const [name, body] of Object.entries(MEDIA_FILES)) fs.writeFileSync(path.join(mediaDir, name), body);

  await db.transaction(async (txAny) => {
    const tx = txAny as unknown as Tx;
    // FORCE RLS applies to non-superuser table owners on managed Postgres; seeding is system work.
    await tx.execute(sql`select set_config('app.mode', 'system', true)`);
    const now = Date.now();
    const daysAgo = (d: number) => new Date(now - d * 86400_000);

    await tx.insert(schema.settings).values([
      { key: 'k_threshold', value: 3 },
      { key: 'auth_methods', value: ['microsoft', 'magiclink'] },
    ]);

    // ── Organisations
    const [azentio] = await tx.insert(schema.organisations).values({ name: 'Azentio', slug: 'azentio', type: 'azentio', industry: 'Software', region: 'Global' }).returning();
    const orgs: Record<string, typeof azentio> = {};
    for (const o of CLIENT_ORGS) [orgs[o.slug]] = await tx.insert(schema.organisations).values({ ...o, type: 'client' }).returning();

    // ── Users
    const mk = async (email: string, name: string) => (await tx.insert(schema.users).values({ email, name, emailVerifiedAt: new Date() }).returning())[0];
    const u = {
      employee: await mk(DEMO_USERS.employee, 'Alex Rivera'),
      publisher: await mk(DEMO_USERS.publisher, 'Priya Nair'),
      moderator: await mk(DEMO_USERS.moderator, 'Maya Chen'),
      owner: await mk(DEMO_USERS.owner, 'Omar Haddad'),
      admin: await mk(DEMO_USERS.admin, 'Ada Okafor'),
      pending: await mk(DEMO_USERS.pending, 'Sam Patel'),
      northwindAdmin: await mk(DEMO_USERS.northwindAdmin, 'Nina Larsen'),
      northwindMember: await mk(DEMO_USERS.northwindMember, 'Noah Berg'),
      harborAdmin: await mk(DEMO_USERS.harborAdmin, 'Hana Brooks'),
      harborMember: await mk(DEMO_USERS.harborMember, 'Hugo Ferreira'),
      meridianAdmin: await mk(DEMO_USERS.meridianAdmin, 'Mia Saleh'),
      meridianMember: await mk(DEMO_USERS.meridianMember, 'Max Rahman'),
      consultant: await mk(DEMO_USERS.consultant, 'Cara Quinn'),
    };
    const background: Record<string, { id: string }> = {};
    for (const slug of ['cedar', 'atlas', 'bluewater']) background[slug] = await mk(`analyst@${slug}.example`, `${orgs[slug].name} analyst`);

    // ── Employee allow-list (sam.pending deliberately absent) + memberships
    const employees = [u.employee, u.publisher, u.moderator, u.owner, u.admin];
    await tx.insert(schema.employeeAllowlist).values(employees.map((e) => ({ emailOrOid: e.email, approvedBy: 'bootstrap' })));
    await tx.insert(schema.memberships).values(employees.map((e) => ({ userId: e.id, orgId: azentio.id, role: 'employee' as const, status: 'active' as const })));
    await tx.insert(schema.accessRequests).values({ userId: u.pending.id });
    const cm = (userId: string, orgId: string, role: 'client_member' | 'client_admin') => ({ userId, orgId, role, status: 'active' as const });
    await tx.insert(schema.memberships).values([
      cm(u.northwindAdmin.id, orgs.northwind.id, 'client_admin'),
      cm(u.northwindMember.id, orgs.northwind.id, 'client_member'),
      cm(u.harborAdmin.id, orgs.harbor.id, 'client_admin'),
      cm(u.harborMember.id, orgs.harbor.id, 'client_member'),
      cm(u.meridianAdmin.id, orgs.meridian.id, 'client_admin'),
      cm(u.meridianMember.id, orgs.meridian.id, 'client_member'),
      cm(u.consultant.id, orgs.northwind.id, 'client_member'),
      cm(u.consultant.id, orgs.harbor.id, 'client_member'),
      ...Object.entries(background).map(([slug, user]) => cm(user.id, orgs[slug].id, 'client_member')),
    ]);

    // ── Platform grants (separate, individually assigned)
    await tx.insert(schema.grants).values([
      { userId: u.publisher.id, grant: 'content_publisher', reason: 'Marketing & broadcasts', grantedBy: 'bootstrap' },
      { userId: u.moderator.id, grant: 'moderator', reason: 'Learning moderation rota', grantedBy: 'bootstrap' },
      { userId: u.owner.id, grant: 'product_owner', reason: 'Financial Analysis Intelligence PO', grantedBy: 'bootstrap' },
      { userId: u.admin.id, grant: 'portal_admin', reason: 'Bootstrap administrator', grantedBy: 'bootstrap' },
    ]);

    // ── Media (served only through signed URLs). Only portal-internal recordings have files;
    // the public showcase videos are "coming soon" on azentio.ai, so they are content records without media.
    const media = async (title: string, file: string, audience: Audience) =>
      (await tx.insert(schema.media).values({ title, filename: file, contentType: 'image/svg+xml', audience, storageKey: file }).returning())[0];
    const mTownhall = await media('Q4 Product Town Hall recording', 'townhall-q4.svg', emp);
    const mNorthwind = await media('Northwind briefing recording', 'northwind-briefing.svg', { kind: 'tenant', tenantId: orgs.northwind.id });

    // ── Offerings: the azentio.ai product catalogue (scripts/azentio-catalogue.ts)
    const bySlug: Record<string, typeof schema.offerings.$inferSelect> = {};
    for (const [i, p] of PRODUCTS.entries()) {
      [bySlug[p.slug]] = await tx
        .insert(schema.offerings)
        .values({
          slug: p.slug, name: p.name, domain: p.family, label: p.label, tagline: p.tagline, status: p.status,
          summary: p.summary, description: p.summary, capabilities: p.capabilities, steps: p.steps, outcomes: p.outcomes,
          sortOrder: i, audience: pub, mediaIds: [],
        })
        .returning();
    }
    const fai = bySlug['financial-analysis'];
    const credit = bySlug['sme-credit-decisioning'];
    const reporting = bySlug['riva'];
    const docs = bySlug['document-intelligence'];

    await tx.insert(schema.entitlements).values([
      { orgId: orgs.northwind.id, offeringId: fai.id, sandboxEnabled: true },
      { orgId: orgs.northwind.id, offeringId: credit.id, sandboxEnabled: false },
      { orgId: orgs.harbor.id, offeringId: fai.id, sandboxEnabled: true },
      { orgId: orgs.harbor.id, offeringId: docs.id, sandboxEnabled: true },
      { orgId: orgs.meridian.id, offeringId: fai.id, sandboxEnabled: false },
      { orgId: orgs.meridian.id, offeringId: reporting.id, sandboxEnabled: false },
    ]);

    // ── Content: public pages from azentio.ai (rendered from these rows), plus internal portal records
    await tx.insert(schema.content).values([
      { type: 'banner', title: 'azentio.ai Hackathon 2026 registrations are open', body: 'Innovation challenges, working sessions, and opportunities to build together.', audience: pub, meta: { ctaLabel: 'Register', ctaHref: '/hackathon' } },
      { type: 'page', slug: 'home', title: 'azentio.ai', summary: HOME.hero.sub, body: HOME.whoWeAre.body, audience: pub, meta: HOME },
      { type: 'page', slug: 'solutions', title: 'Solutions', summary: 'Where intelligence meets everyday financial-services work.', body: SOLUTIONS.map((x) => `${x.title}: ${x.body}`).join('\n\n'), audience: pub, meta: { areas: SOLUTIONS } },
      { type: 'page', slug: 'about', title: 'About azentio.ai', summary: ABOUT.tagline, body: `${ABOUT.mission}\n\n${ABOUT.vision}\n\n${ABOUT.approach}`, audience: pub, meta: ABOUT },
      { type: 'page', slug: 'lab', title: 'AI Lab', summary: LAB.title, body: [LAB.intro, ...LAB.sections.map((x) => `${x.title}: ${x.body}`)].join('\n\n'), audience: pub, meta: LAB },
      { type: 'page', slug: 'technology', title: 'Technology', summary: TECHNOLOGY.title, body: [TECHNOLOGY.intro, ...TECHNOLOGY.pillars.map((x) => `${x.title}: ${x.body}`)].join('\n\n'), audience: pub, meta: TECHNOLOGY },
      { type: 'page', slug: 'media', title: 'Media', summary: 'See intelligence in action.', body: 'Product showcases and stories from azentio.ai.', audience: pub },
      ...INSIGHTS.map((x) => ({ type: 'insight' as const, title: x.title, summary: x.summary, body: x.summary, audience: pub, meta: { topic: x.topic } })),
      ...MEDIA.map((x) => ({ type: 'media' as const, title: x.title, summary: x.summary, body: x.summary, audience: pub, meta: { kind: x.kind, availability: 'coming_soon' } })),
      { type: 'experiment', title: 'Agentic spreading prototype notes (internal)', summary: 'Employee-only experiment: Project Lighthouse.', body: 'Project Lighthouse is an internal experiment testing agentic spreading with synthetic statements. Prompt templates and model choices are internal and not for client or public use. Owner: platform research.', audience: emp, ownerId: u.employee.id, meta: { status: 'running' } },
      { type: 'experiment', title: 'Seasonal baseline A/B (internal)', summary: 'Comparing naive vs seasonality-aware baselines on synthetic SMEs.', body: 'Internal experiment comparing baselines on 3 synthetic scenarios. Results are exploratory.', audience: emp, ownerId: u.owner.id, meta: { status: 'proposed' } },
      { type: 'library', title: 'Synthetic data handbook', summary: 'How we generate and label synthetic demo data.', body: 'Every demo dataset is generated, labelled synthetic and reviewed. Never paste client data into demos.', audience: emp, ownerId: u.admin.id, reviewDate: new Date(now + 60 * 86400_000).toISOString().slice(0, 10) },
      { type: 'library', title: 'Moderation playbook', summary: 'Redaction, generalisation and attribution rules.', body: 'Generalise city to region and dates to quarters. Remove unusual transaction details. Attribution only on author opt-in plus moderator approval.', audience: emp, ownerId: u.moderator.id, reviewDate: new Date(now - 10 * 86400_000).toISOString().slice(0, 10) },
      { type: 'release_note', title: 'Portal 0.9 — collective learning hub', summary: 'Moderated sharing, themes and ideas.', body: 'Adds moderated shared observations, theme dashboard with k-threshold and idea status updates.', audience: emp },
      { type: 'briefing', title: 'Northwind quarterly briefing (synthetic)', summary: 'Client-specific briefing for Northwind Bank.', body: 'Your entitled offerings and upcoming sessions. Invitation-only webinar on seasonality-aware analysis next month.', audience: { kind: 'tenant', tenantId: orgs.northwind.id } },
      { type: 'release_note', title: 'Client release notes — October', summary: 'What changed for clients.', body: 'Workspace switcher, contribution status tracking and safe trend digests.', audience: { kind: 'shared_community' } },
      // AT-03 fixture: a record with no audience metadata must be denied to everyone.
      { type: 'library', title: 'Orphaned record without audience', body: 'Should never be visible.', audience: null },
    ]);

    // ── Broadcasts
    await tx.insert(schema.broadcasts).values([
      { title: 'Q4 Product Town Hall', description: 'Employee-only roadmap discussion (internal).', audience: emp, startsAt: daysAgo(3), status: 'ended', recordingMediaId: mTownhall.id, createdBy: u.publisher.id },
      { title: 'Playground office hours', description: 'Live help with the internal Playground.', audience: emp, startsAt: new Date(now + 2 * 86400_000), status: 'scheduled', createdBy: u.publisher.id },
      { title: 'Northwind: seasonality-aware analysis (invitation-only)', description: 'Client-only webinar for Northwind Bank.', audience: { kind: 'tenant', tenantId: orgs.northwind.id }, startsAt: new Date(now + 9 * 86400_000), status: 'scheduled', recordingMediaId: mNorthwind.id, createdBy: u.publisher.id },
      { title: 'Community roundtable: document handling', description: 'Open to all client workspaces.', audience: { kind: 'shared_community' }, startsAt: new Date(now + 14 * 86400_000), status: 'scheduled', createdBy: u.publisher.id },
    ]);

    await tx.insert(schema.events).values({ slug: 'hackathon-2026', title: 'azentio.ai Hackathon 2026', description: 'Build governed collective learning: public discovery, employee innovation, client collaboration.', capacity: 60, startsAt: new Date('2026-11-20T09:00:00Z') });

    // ── Themes
    const theme = async (name: string, summary: string, offeringIds: string[], limitations: string) =>
      (await tx.insert(schema.themes).values({ name, summary, offeringIds, limitations }).returning())[0];
    const tSeason = await theme('Seasonality context', 'Seasonal SME cash flow is being compared against naive annualised baselines, producing inconsistent assessments.', [fai.id], 'Small, self-selected sample of contributing organisations. Indicates a recurring observation, not market prevalence or cause.');
    const tDocs = await theme('Document upload friction', 'Borrowers and analysts report friction assembling multi-document packs.', [docs.id], 'Observations describe experience, not measured drop-off rates.');
    const tReg = await theme('Regulatory change cadence', 'Frequent rule updates strain reporting validation cycles.', [reporting.id], 'Early signal; limited regional coverage.');
    const tOnb = await theme('Onboarding drop-off', 'Digital onboarding steps lose applicants mid-flow.', [], 'Single-source so far.');

    // ── Observations + shared copies
    type ObsSeed = {
      org: string; author: { id: string }; title: string; body: string; topic: string; region: string; industry: string;
      period: [string, string]; state: string; intent: 'private' | 'org' | 'propose_shared'; type?: string; offeringId?: string;
      shared?: { title: string; body: string; region: string; quarter: string; theme?: string; attribution?: boolean };
      evidenceType?: string; confidence?: 'low' | 'medium' | 'high';
    };
    const seedObs = async (o: ObsSeed) => {
      const [obs] = await tx
        .insert(schema.observations)
        .values({
          tenantId: orgs[o.org].id, authorId: o.author.id, type: (o.type ?? 'market_observation') as 'market_observation', offeringId: o.offeringId ?? null,
          industry: o.industry, region: o.region, topic: o.topic, periodStart: o.period[0], periodEnd: o.period[1], evidenceType: o.evidenceType ?? 'Portfolio review',
          confidence: o.confidence ?? 'medium', title: o.title, body: o.body, visibilityIntent: o.intent, state: o.state, sensitiveFlags: o.state === 'draft' ? [] : scanSensitive(o),
        })
        .returning();
      if (o.intent !== 'private' && o.state !== 'draft') {
        await tx.insert(schema.consents).values({ observationId: obs.id, tenantId: obs.tenantId, version: 1, storeProcess: true, publishShared: o.intent === 'propose_shared', attribution: !!o.shared?.attribution, trainingProgramme: false, actorId: o.author.id });
      }
      if (o.shared) {
        const [s] = await tx
          .insert(schema.sharedInsights)
          .values({ sourceObservationId: obs.id, sourceTenantId: obs.tenantId, version: 1, type: obs.type, title: o.shared.title, body: o.shared.body, offeringId: obs.offeringId, industry: o.industry, regionGeneralised: o.shared.region, periodQuarter: o.shared.quarter, topic: o.topic, confidence: obs.confidence, attributionOrgName: o.shared.attribution ? orgs[o.org].name : null, status: 'published', publishedAt: daysAgo(5) })
          .returning();
        await tx.insert(schema.reviews).values({ observationId: obs.id, tenantId: obs.tenantId, version: 1, moderatorId: u.moderator.id, decision: 'approve', authorReason: 'Approved with region and dates generalised.', internalNote: 'Seeded approval.' });
        if (o.shared.theme) await tx.insert(schema.themeLinks).values({ themeId: o.shared.theme, sharedInsightId: s.id });
        return { obs, shared: s };
      }
      return { obs, shared: null };
    };

    const S = 'Seasonality';
    await seedObs({
      org: 'northwind', author: u.northwindMember, offeringId: fai.id, topic: S, region: 'Leeds', industry: 'SME lending', period: ['2026-01-01', '2026-03-31'], state: 'published', intent: 'propose_shared', confidence: 'high',
      title: 'Seasonal SMEs flagged as distressed after Q1 annualisation',
      body: 'In our Leeds SME book, garden-supply and tourism borrowers were repeatedly flagged when Q1 revenue was annualised. Peak-season revenue made the full-year picture healthy.',
      shared: { title: 'Seasonal SMEs flagged as distressed after off-season annualisation', body: 'Garden-supply and tourism borrowers were repeatedly flagged when an off-season quarter was annualised, although full-year revenue was healthy.', region: 'Europe', quarter: '2026 Q1', theme: tSeason.id },
    });
    await seedObs({
      org: 'northwind', author: u.northwindAdmin, offeringId: fai.id, topic: S, region: 'Europe', industry: 'SME lending', period: ['2026-04-01', '2026-06-30'], state: 'published', intent: 'propose_shared',
      title: 'Analysts manually override seasonal comparisons',
      body: 'Credit analysts keep side spreadsheets to adjust for seasonality before committee because the standard comparison does not explain seasonal swings.',
      shared: { title: 'Analysts manually override seasonal comparisons', body: 'Credit analysts keep side calculations to adjust for seasonality before committee because standard comparisons do not explain seasonal swings.', region: 'Europe', quarter: '2026 Q2', theme: tSeason.id },
    });
    await seedObs({
      org: 'harbor', author: u.harborMember, offeringId: fai.id, topic: S, region: 'Chicago', industry: 'Credit unions', period: ['2026-01-15', '2026-02-28'], state: 'published', intent: 'propose_shared',
      title: 'Member businesses with harvest cycles look inconsistent quarter to quarter',
      body: 'Agricultural member businesses show strong Q3-Q4 and weak Q1. Our reviewers treated the same borrower differently depending on which quarter was used.',
      shared: { title: 'Harvest-cycle businesses assessed inconsistently across quarters', body: 'Agricultural businesses show strong second-half and weak first-quarter revenue; reviewers treated the same borrower differently depending on the quarter used.', region: 'North America', quarter: '2026 Q1', theme: tSeason.id },
    });
    // Meridian's seasonality item is awaiting moderation: approving it takes the theme to k = 3.
    await seedObs({
      org: 'meridian', author: u.meridianMember, offeringId: fai.id, topic: S, region: 'Dubai', industry: 'SME lending', period: ['2026-03-01', '2026-04-15'], state: 'submitted', intent: 'propose_shared',
      title: 'Ramadan-season retail swings distort quarterly comparisons',
      body: 'Retail SMEs in Dubai see revenue concentrated around Ramadan and Eid. Coastal Freight Ltd, one of our customers, was flagged although its annual cash flow is stable. Quarterly comparisons without a seasonal baseline overstate risk.',
    });

    // Document handling — 3 orgs (established theme)
    for (const [org, region, gen] of [['cedar', 'Frankfurt', 'Europe'], ['atlas', 'Singapore', 'Asia Pacific'], ['bluewater', 'Nairobi', 'Africa']] as const) {
      await seedObs({
        org, author: background[org], offeringId: docs.id, topic: 'Document handling', region, industry: orgs[org].industry!, period: ['2026-04-01', '2026-06-30'], state: 'published', intent: 'propose_shared', type: 'operational_challenge',
        title: 'Multi-document loan packs stall at upload', body: 'Applicants abandon or resend packs when one document fails validation, and analysts lose track of which version is current.',
        shared: { title: 'Multi-document loan packs stall at upload', body: 'Applicants abandon or resend packs when one document fails validation, and analysts lose track of which version is current.', region: gen, quarter: '2026 Q2', theme: tDocs.id },
      });
    }
    // Regulatory change — 2 orgs (emerging)
    for (const org of ['cedar', 'atlas'] as const) {
      await seedObs({
        org, author: background[org], offeringId: reporting.id, topic: 'Regulatory change', region: orgs[org].region!, industry: orgs[org].industry!, period: ['2026-05-01', '2026-07-31'], state: 'published', intent: 'propose_shared', type: 'trend',
        title: 'Validation rules lag behind rule updates', body: 'Reporting teams patch validation rules manually after each regulatory update, creating a backlog during filing windows.',
        shared: { title: 'Validation rules lag behind rule updates', body: 'Reporting teams patch validation rules manually after each regulatory update, creating a backlog during filing windows.', region: orgs[org].region!, quarter: '2026 Q2–Q3', theme: tReg.id },
      });
    }
    // Onboarding — 1 org (emerging)
    await seedObs({
      org: 'bluewater', author: background.bluewater, topic: 'Customer onboarding', region: 'Africa', industry: 'Consumer finance', period: ['2026-06-01', '2026-08-31'], state: 'published', intent: 'propose_shared', type: 'product_gap',
      title: 'Applicants drop off at income verification', body: 'Digital applicants leave the flow at income verification when asked to upload statements they do not have to hand.',
      shared: { title: 'Applicants drop off at income verification', body: 'Digital applicants leave the flow at income verification when asked to upload statements they do not have to hand.', region: 'Africa', quarter: '2026 Q3', theme: tOnb.id },
    });

    // Private + org-only + returned records (never visible outside their tenant)
    await seedObs({
      org: 'northwind', author: u.northwindMember, offeringId: fai.id, topic: S, region: 'Leeds', industry: 'SME lending', period: ['2026-07-01', '2026-09-30'], state: 'draft', intent: 'private',
      title: 'Draft: Brightwater Bakery covenant breach in Q3', body: 'Private draft. Brightwater Bakery account 44120987 breached a covenant in Q3 but recovered in October; pricing terms under review. Not for sharing.',
    });
    await seedObs({
      org: 'northwind', author: u.northwindAdmin, topic: 'Data quality', region: 'Europe', industry: 'Banking', period: ['2026-08-01', '2026-09-30'], state: 'org_shared', intent: 'org', type: 'successful_practice',
      title: 'Internal: weekly spreading QA huddle works', body: 'A fifteen-minute weekly huddle reviewing five random spreads cut rework noticeably in our team. Sharing inside Northwind only.',
    });
    const returned = await seedObs({
      org: 'harbor', author: u.harborMember, offeringId: docs.id, topic: 'Document handling', region: 'Toronto', industry: 'Credit unions', period: ['2026-08-01', '2026-08-31'], state: 'returned', intent: 'propose_shared',
      title: 'Scanned statements fail OCR more often', body: 'Statements scanned at branch fail extraction far more often than digital originals, so reviewers re-key data.',
    });
    await tx.insert(schema.reviews).values({ observationId: returned.obs.id, tenantId: returned.obs.tenantId, version: 1, moderatorId: u.moderator.id, decision: 'return', authorReason: 'Could you describe roughly how much more often (e.g. a range) without exact figures?', internalNote: 'Possible duplicate of doc-handling theme; keep if clarified.' });
    await tx.insert(schema.notifications).values({ userId: u.harborMember.id, type: 'moderation_decision', title: '“Scanned statements fail OCR more often” — Returned for clarification', body: 'Could you describe roughly how much more often (e.g. a range) without exact figures?', link: `/w/_/observations/${returned.obs.id}` });

    // ── Ideas
    const docsLinked = rows<{ id: string }>(await tx.execute(sql`select s.id from shared_insights s join theme_links l on l.shared_insight_id = s.id where l.theme_id = ${tDocs.id}`));
    const [idea] = await tx
      .insert(schema.ideas)
      .values({ title: 'Pack-level upload status for Document Intelligence', problem: 'Analysts and applicants lose track of which document in a multi-document pack failed validation.', offeringId: docs.id, proposedOutcome: 'Show per-document status within a pack and allow replacing a single document.', ownerTeam: 'Document Intelligence squad', ownerId: u.owner.id, priority: 'medium', status: 'planned', publicUpdate: 'Planned for a future release after design review. Not a delivery commitment.', internalNotes: 'Sizing pending; depends on storage refactor.', createdBy: u.owner.id, updatedAt: daysAgo(2) })
      .returning();
    for (const d of docsLinked) await tx.insert(schema.ideaEvidence).values({ ideaId: idea.id, sharedInsightId: d.id });

    // ── Seed search index (public, employee, tenant, shared)
    const { indexDocument } = await import('@/lib/search');
    for (const o of Object.values(bySlug)) {
      await indexDocument(tx, { audienceKey: 'public', sourceType: 'offering', sourceId: o.id, title: o.name, text: `${o.label}. ${o.tagline} ${o.summary} ${[...o.capabilities, ...o.outcomes].join('. ')}`, url: `/products/${o.slug}` });
    }
    const contentRows = await tx.select().from(schema.content);
    for (const c of contentRows) {
      const a = c.audience;
      if (!a || c.type === 'banner') continue;
      const key = a.kind === 'public' ? 'public' : a.kind === 'employee' ? 'employee' : a.kind === 'tenant' ? `tenant:${a.tenantId}` : a.kind === 'shared_community' ? 'shared_community' : null;
      if (!key) continue;
      const sourceType = a.kind === 'public' ? 'public_content' : a.kind === 'employee' ? 'employee_content' : 'tenant_content';
      await indexDocument(tx, { audienceKey: key, sourceType, sourceId: c.id, title: c.title, text: `${c.summary ?? ''} ${c.body}`, url: c.type === 'page' ? (c.slug === 'home' ? '/' : `/${c.slug}`) : a.kind === 'employee' ? `/hub/library/${c.id}` : `/insights#${c.id}` });
    }
    const shared = await tx.select().from(schema.sharedInsights);
    for (const s of shared) await indexDocument(tx, { audienceKey: 'shared_community', sourceType: 'shared_insight', sourceId: s.id, title: s.title, text: s.body, url: `/community/${s.id}` });

    // ── Collaboration, team spaces and the federated programme (scripts/seed/*)
    const { seedExtras } = await import('./seed/extras');
    await seedExtras(tx);
  });
}
