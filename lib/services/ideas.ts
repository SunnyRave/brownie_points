import { desc, eq, inArray, and } from 'drizzle-orm';
import { schema, withSystemTx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/outbox';
import { enforce } from '@/lib/policy/enforce';
import { badRequest, notFound } from '@/lib/http';
import { isEmployee } from '@/lib/policy/authorize';
import { toSharedInsightDTO } from '@/lib/learning/dto';
import { communityResource } from '@/lib/insights';
import { IDEA_STATUS_LABELS, ideaCreateSchema, ideaStatusSchema } from '@/lib/validation';
import type { Principal } from '@/lib/policy/types';

const ownerResource = { type: 'idea', audience: { kind: 'grant' as const, grant: 'product_owner' as const } };

/** Client-safe idea: plain-language status, owner team, public update. No priority, internal notes or problem drafts. */
export type PublicIdeaDTO = { id: string; title: string; offering: string | null; status: string; statusLabel: string; ownerTeam: string; publicUpdate: string; updatedAt: string };

export async function listPublicIdeas(principal: Principal | null): Promise<PublicIdeaDTO[]> {
  await enforce(principal, 'read', communityResource);
  return withSystemTx(async (tx) => {
    const rows = await tx
      .select({ idea: schema.ideas, offering: schema.offerings.name })
      .from(schema.ideas)
      .leftJoin(schema.offerings, eq(schema.offerings.id, schema.ideas.offeringId))
      .orderBy(desc(schema.ideas.updatedAt));
    return rows
      .filter((r) => r.idea.publicUpdate.trim().length > 0)
      .map(({ idea, offering }) => ({ id: idea.id, title: idea.title, offering, status: idea.status, statusLabel: IDEA_STATUS_LABELS[idea.status], ownerTeam: idea.ownerTeam, publicUpdate: idea.publicUpdate, updatedAt: idea.updatedAt.toISOString() }));
  });
}

/** Employee view: all ideas; full detail incl. evidence only for product owners (assigned or unscoped). */
export async function listIdeasForEmployee(principal: Principal | null) {
  await enforce(principal, 'read', { type: 'idea', audience: { kind: 'employee' } });
  return withSystemTx(async (tx) =>
    tx
      .select({ id: schema.ideas.id, title: schema.ideas.title, status: schema.ideas.status, ownerTeam: schema.ideas.ownerTeam, priority: schema.ideas.priority, updatedAt: schema.ideas.updatedAt, offering: schema.offerings.name })
      .from(schema.ideas)
      .leftJoin(schema.offerings, eq(schema.offerings.id, schema.ideas.offeringId))
      .orderBy(desc(schema.ideas.updatedAt)),
  );
}

/** Assignment grants access only to the evidence explicitly linked to that idea. */
export async function getIdeaForOwner(principal: Principal | null, ideaId: string) {
  await enforce(principal, 'read', { type: 'idea', id: ideaId, audience: { kind: 'assigned', ideaId } });
  return withSystemTx(async (tx) => {
    const [idea] = await tx.select().from(schema.ideas).where(eq(schema.ideas.id, ideaId)).limit(1);
    if (!idea) throw notFound();
    const evidence = await tx
      .select({ shared: schema.sharedInsights })
      .from(schema.ideaEvidence)
      .innerJoin(schema.sharedInsights, eq(schema.sharedInsights.id, schema.ideaEvidence.sharedInsightId))
      .where(eq(schema.ideaEvidence.ideaId, ideaId));
    const history = await tx
      .select({ action: schema.auditEvents.action, meta: schema.auditEvents.meta, at: schema.auditEvents.createdAt })
      .from(schema.auditEvents)
      .where(and(eq(schema.auditEvents.resourceType, 'idea'), eq(schema.auditEvents.resourceId, ideaId)))
      .orderBy(desc(schema.auditEvents.createdAt));
    return {
      idea: { ...idea, createdAt: idea.createdAt.toISOString(), updatedAt: idea.updatedAt.toISOString() },
      evidence: evidence.filter((e) => e.shared.status === 'published').map((e) => toSharedInsightDTO(e.shared)),
      history: history.map((h) => ({ ...h, at: h.at.toISOString() })),
    };
  });
}

/** Evidence picker for product owners: approved shared insights only — never raw submissions. */
export async function listLinkableEvidence(principal: Principal | null) {
  await enforce(principal, 'manage_idea', ownerResource);
  return withSystemTx(async (tx) => {
    const rows = await tx.select().from(schema.sharedInsights).where(eq(schema.sharedInsights.status, 'published')).orderBy(desc(schema.sharedInsights.publishedAt));
    return rows.map(toSharedInsightDTO);
  });
}

export async function createIdea(principal: Principal | null, raw: unknown) {
  await enforce(principal, 'manage_idea', ownerResource);
  const input = ideaCreateSchema.parse(raw);
  return withSystemTx(async (tx) => {
    if (input.evidenceIds.length) {
      const ok = await tx.select({ id: schema.sharedInsights.id }).from(schema.sharedInsights).where(and(inArray(schema.sharedInsights.id, input.evidenceIds), eq(schema.sharedInsights.status, 'published')));
      if (ok.length !== new Set(input.evidenceIds).size) throw badRequest('evidence_not_permitted', 'Only published shared insights can be linked.');
    }
    const [idea] = await tx
      .insert(schema.ideas)
      .values({ title: input.title, problem: input.problem, offeringId: input.offeringId, proposedOutcome: input.proposedOutcome, ownerTeam: input.ownerTeam, priority: input.priority, ownerId: principal!.userId, createdBy: principal!.userId })
      .returning();
    if (input.evidenceIds.length) await tx.insert(schema.ideaEvidence).values(input.evidenceIds.map((sharedInsightId) => ({ ideaId: idea.id, sharedInsightId })));
    await audit(tx, { actorId: principal!.userId, action: 'idea.create', resourceType: 'idea', resourceId: idea.id, meta: { status: idea.status, evidence: input.evidenceIds.length } });
    return { id: idea.id };
  });
}

/**
 * INS-05/06: status changes are audited and contributors behind the linked evidence receive an
 * audience-appropriate update — the public update text only, never internal notes or other clients' sources.
 */
export async function updateIdeaStatus(principal: Principal | null, ideaId: string, raw: unknown) {
  await enforce(principal, 'manage_idea', { type: 'idea', id: ideaId, audience: { kind: 'assigned', ideaId } });
  const input = ideaStatusSchema.parse(raw);
  return withSystemTx(async (tx) => {
    const [idea] = await tx.select().from(schema.ideas).where(eq(schema.ideas.id, ideaId)).limit(1);
    if (!idea) throw notFound();
    const now = new Date();
    await tx.update(schema.ideas).set({ status: input.status, publicUpdate: input.publicUpdate, internalNotes: input.internalNotes ?? idea.internalNotes, updatedAt: now }).where(eq(schema.ideas.id, ideaId));
    await audit(tx, { actorId: principal!.userId, action: 'idea.status_change', resourceType: 'idea', resourceId: ideaId, meta: { from: idea.status, to: input.status } });
    const authors = await tx
      .selectDistinct({ authorId: schema.observations.authorId })
      .from(schema.ideaEvidence)
      .innerJoin(schema.sharedInsights, eq(schema.sharedInsights.id, schema.ideaEvidence.sharedInsightId))
      .innerJoin(schema.observations, eq(schema.observations.id, schema.sharedInsights.sourceObservationId))
      .where(eq(schema.ideaEvidence.ideaId, ideaId));
    for (const a of authors) {
      await notify(tx, {
        userId: a.authorId,
        type: 'idea_status',
        title: `An idea linked to your shared contribution is now “${IDEA_STATUS_LABELS[input.status]}”`,
        body: `${idea.title}: ${input.publicUpdate}`,
        link: '/w/_/ideas',
        dedupeKey: `idea:${ideaId}:${input.status}:${now.getTime()}:${a.authorId}`,
      });
    }
    return { notified: authors.length };
  });
}

export const canSeeIdeasInternally = (p: Principal | null) => isEmployee(p);
