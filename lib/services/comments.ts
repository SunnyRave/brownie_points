import { and, asc, desc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import { schema, withSystemTx, type Tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/outbox';
import { enforce } from '@/lib/policy/enforce';
import { isEmployee } from '@/lib/policy/authorize';
import { HttpError, notFound } from '@/lib/http';
import { scanSensitive } from '@/lib/scan';
import { communityResource } from '@/lib/insights';
import { commentDecisionSchema, commentSchema, reportSchema } from '@/lib/validation';
import type { Principal } from '@/lib/policy/types';

/**
 * Collaborative comments (CLI-08/09). A comment inherits its parent shared insight's audience: only principals
 * admitted to the shared community can read or write, only while the parent is published. Author identity
 * (user id, tenant, email, org) never leaves the server; readers see a role label only.
 * comments/comment_reports are system-mode-only under RLS, so every entry point calls enforce() first.
 */

const queueResource = { type: 'moderation_queue', audience: { kind: 'grant' as const, grant: 'moderator' as const } };
type CommentRow = typeof schema.comments.$inferSelect;

export type CommentDTO = {
  id: string;
  body: string | null;
  createdAt: string;
  authorLabel: string;
  isMine: boolean;
  /** Present only on the viewer's own held comment, or as a placeholder for moderated comments. */
  status: 'Awaiting moderation' | 'Hidden by moderators' | 'Removed by moderators' | null;
};

/** Explicit allow-list serialiser. Never spread a comment row. */
export function toCommentDTO(c: CommentRow, viewerId: string): CommentDTO {
  const isMine = c.authorId === viewerId;
  const role = c.authorKind === 'employee' ? 'Azentio employee' : 'Client participant';
  if (c.status === 'hidden' || c.status === 'removed') {
    return { id: c.id, body: null, createdAt: c.createdAt.toISOString(), authorLabel: 'Moderated', isMine: false, status: c.status === 'hidden' ? 'Hidden by moderators' : 'Removed by moderators' };
  }
  return {
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    authorLabel: isMine ? `You · ${role}` : role,
    isMine,
    status: c.status === 'held' ? 'Awaiting moderation' : null,
  };
}

async function publishedParent(tx: Tx, sharedId: string) {
  const [parent] = await tx
    .select({ id: schema.sharedInsights.id, title: schema.sharedInsights.title, sourceObservationId: schema.sharedInsights.sourceObservationId })
    .from(schema.sharedInsights)
    .where(and(eq(schema.sharedInsights.id, sharedId), eq(schema.sharedInsights.status, 'published')))
    .limit(1);
  if (!parent) throw notFound();
  return parent;
}

export async function listComments(principal: Principal | null, sharedId: string): Promise<CommentDTO[]> {
  await enforce(principal, 'read', { ...communityResource, id: sharedId });
  const viewer = principal!.userId;
  return withSystemTx(async (tx) => {
    await publishedParent(tx, sharedId); // a withdrawn/unpublished parent takes its comments with it
    const rows = await tx
      .select()
      .from(schema.comments)
      .where(and(eq(schema.comments.sharedInsightId, sharedId), or(inArray(schema.comments.status, ['visible', 'hidden', 'removed']), and(eq(schema.comments.status, 'held'), eq(schema.comments.authorId, viewer)))))
      .orderBy(asc(schema.comments.createdAt))
      .limit(200);
    return rows.map((r) => toCommentDTO(r, viewer));
  });
}

/** Comment counts per item (visible only), for feed cards. Parent must be published. */
export async function commentCounts(principal: Principal | null, ids: string[]) {
  await enforce(principal, 'read', communityResource);
  if (!ids.length) return {} as Record<string, number>;
  const rows = await withSystemTx((tx) =>
    tx
      .select({ id: schema.comments.sharedInsightId, n: sql<number>`count(*)::int` })
      .from(schema.comments)
      .innerJoin(schema.sharedInsights, eq(schema.sharedInsights.id, schema.comments.sharedInsightId))
      .where(and(inArray(schema.comments.sharedInsightId, ids.slice(0, 200)), eq(schema.comments.status, 'visible'), eq(schema.sharedInsights.status, 'published')))
      .groupBy(schema.comments.sharedInsightId),
  );
  return Object.fromEntries(rows.map((r) => [r.id, r.n])) as Record<string, number>;
}

/** Flagged content (account numbers, emails, customer names, confidential terms…) is held for a moderator. */
export async function createComment(principal: Principal | null, sharedId: string, raw: unknown) {
  await enforce(principal, 'create', { type: 'comment', id: sharedId, audience: { kind: 'shared_community' } });
  const p = principal!;
  const { body } = commentSchema.parse(raw);
  const flags = scanSensitive({ title: '', body });
  const employee = isEmployee(p);
  return withSystemTx(async (tx) => {
    const parent = await publishedParent(tx, sharedId);
    const since = new Date(Date.now() - 10 * 60 * 1000);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.comments).where(and(eq(schema.comments.authorId, p.userId), gt(schema.comments.createdAt, since)));
    if (n >= 10) throw new HttpError(429, 'rate_limited', 'You are commenting very quickly. Please wait a few minutes.');
    const status = flags.length ? ('held' as const) : ('visible' as const);
    const [row] = await tx
      .insert(schema.comments)
      .values({ sharedInsightId: sharedId, authorId: p.userId, authorTenantId: employee ? null : p.activeTenantId, authorKind: employee ? 'employee' : 'client', body, status, sensitiveFlags: flags })
      .returning();
    await audit(tx, { actorId: p.userId, action: 'comment.create', resourceType: 'comment', resourceId: row.id, tenantId: employee ? null : p.activeTenantId, meta: { sharedInsightId: sharedId, status, flagCount: flags.length } });
    if (status === 'held') {
      const moderators = await tx.select({ userId: schema.grants.userId }).from(schema.grants).where(eq(schema.grants.grant, 'moderator'));
      for (const m of moderators) await notify(tx, { userId: m.userId, type: 'comment_held', title: 'A comment is awaiting moderation', body: 'The automated check flagged possible sensitive content.', link: '/moderate/comments', dedupeKey: `comment-held:${row.id}:${m.userId}` });
    } else {
      // Tell the contributor someone engaged — no commenter identity, and never notify yourself.
      const [obs] = await tx.select({ authorId: schema.observations.authorId }).from(schema.observations).where(eq(schema.observations.id, parent.sourceObservationId));
      if (obs && obs.authorId !== p.userId) {
        await notify(tx, { userId: obs.authorId, type: 'comment', title: `New comment on your shared contribution “${parent.title}”`, body: 'A community participant commented on the de-identified shared copy.', link: `/community/${sharedId}`, dedupeKey: `comment-new:${row.id}` });
      }
    }
    return { comment: toCommentDTO(row, p.userId), held: status === 'held' };
  });
}

export async function reportComment(principal: Principal | null, commentId: string, raw: unknown) {
  await enforce(principal, 'report', { type: 'comment', id: commentId, audience: { kind: 'shared_community' } });
  const p = principal!;
  const input = reportSchema.parse(raw);
  return withSystemTx(async (tx) => {
    const [c] = await tx.select().from(schema.comments).where(eq(schema.comments.id, commentId)).limit(1);
    if (!c || c.status !== 'visible') throw notFound();
    await publishedParent(tx, c.sharedInsightId);
    const [report] = await tx.insert(schema.commentReports).values({ commentId, reporterId: p.userId, reason: input.reason, details: input.details ?? null }).returning();
    const moderators = await tx.select({ userId: schema.grants.userId }).from(schema.grants).where(eq(schema.grants.grant, 'moderator'));
    for (const m of moderators) await notify(tx, { userId: m.userId, type: 'comment_report', title: `Comment report: ${input.reason}`, link: '/moderate/comments', dedupeKey: `comment-report:${report.id}:${m.userId}` });
    await audit(tx, { actorId: p.userId, action: 'comment.report', resourceType: 'comment_report', resourceId: report.id, meta: { commentId, reason: input.reason } });
    return { reportId: report.id };
  });
}

// ───────── Moderation ─────────

/** Held comments, open comment reports and "needs evidence" signals for moderators. No author identities. */
export async function commentModerationQueue(principal: Principal | null) {
  await enforce(principal, 'moderate', queueResource);
  return withSystemTx(async (tx) => {
    const held = await tx
      .select({ id: schema.comments.id, body: schema.comments.body, flags: schema.comments.sensitiveFlags, authorKind: schema.comments.authorKind, createdAt: schema.comments.createdAt, parentId: schema.sharedInsights.id, parentTitle: schema.sharedInsights.title, parentStatus: schema.sharedInsights.status })
      .from(schema.comments)
      .innerJoin(schema.sharedInsights, eq(schema.sharedInsights.id, schema.comments.sharedInsightId))
      .where(eq(schema.comments.status, 'held'))
      .orderBy(desc(schema.comments.createdAt));
    const reports = await tx
      .select({ id: schema.commentReports.id, reason: schema.commentReports.reason, details: schema.commentReports.details, createdAt: schema.commentReports.createdAt, commentId: schema.comments.id, commentBody: schema.comments.body, commentStatus: schema.comments.status, authorKind: schema.comments.authorKind, parentId: schema.sharedInsights.id, parentTitle: schema.sharedInsights.title })
      .from(schema.commentReports)
      .innerJoin(schema.comments, eq(schema.comments.id, schema.commentReports.commentId))
      .innerJoin(schema.sharedInsights, eq(schema.sharedInsights.id, schema.comments.sharedInsightId))
      .where(eq(schema.commentReports.status, 'open'))
      .orderBy(desc(schema.commentReports.createdAt));
    const hidden = await tx
      .select({ id: schema.comments.id, body: schema.comments.body, authorKind: schema.comments.authorKind, updatedAt: schema.comments.updatedAt, parentTitle: schema.sharedInsights.title })
      .from(schema.comments)
      .innerJoin(schema.sharedInsights, eq(schema.sharedInsights.id, schema.comments.sharedInsightId))
      .where(eq(schema.comments.status, 'hidden'))
      .orderBy(desc(schema.comments.updatedAt))
      .limit(20);
    const signals = await tx
      .select({
        id: schema.sharedInsights.id,
        title: schema.sharedInsights.title,
        evidenceQuality: schema.sharedInsights.evidenceQuality,
        needsEvidence: sql<number>`count(*) filter (where ${schema.contributionFeedback.rating} = 'needs_evidence')::int`,
        useful: sql<number>`count(*) filter (where ${schema.contributionFeedback.rating} = 'useful')::int`,
      })
      .from(schema.contributionFeedback)
      .innerJoin(schema.sharedInsights, eq(schema.sharedInsights.id, schema.contributionFeedback.sharedInsightId))
      .where(eq(schema.sharedInsights.status, 'published'))
      .groupBy(schema.sharedInsights.id, schema.sharedInsights.title, schema.sharedInsights.evidenceQuality);
    return {
      held: held.map((h) => ({ ...h, flags: undefined, flagKinds: [...new Set(h.flags.map((f) => f.kind))], createdAt: h.createdAt.toISOString() })),
      reports: reports.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      hidden: hidden.map((h) => ({ ...h, updatedAt: h.updatedAt.toISOString() })),
      needsEvidence: signals.filter((s) => s.needsEvidence > 0).sort((a, b) => b.needsEvidence - a.needsEvidence),
    };
  });
}

const NEXT: Record<'approve' | 'hide' | 'remove' | 'restore' | 'dismiss', { from: CommentRow['status'][]; to: CommentRow['status'] | null; label: string }> = {
  approve: { from: ['held'], to: 'visible', label: 'approved and now visible' },
  hide: { from: ['visible', 'held'], to: 'hidden', label: 'hidden by moderators' },
  remove: { from: ['visible', 'held', 'hidden'], to: 'removed', label: 'removed by moderators' },
  restore: { from: ['hidden'], to: 'visible', label: 'restored' },
  dismiss: { from: ['visible'], to: null, label: 'reviewed — no action needed' },
};

/** Every decision carries an author-facing note; open reports on the comment are resolved with it. */
export async function decideComment(principal: Principal | null, commentId: string, raw: unknown) {
  await enforce(principal, 'moderate', { ...queueResource, id: commentId });
  const input = commentDecisionSchema.parse(raw);
  const moderatorId = principal!.userId;
  return withSystemTx(async (tx) => {
    const [c] = await tx.select().from(schema.comments).where(eq(schema.comments.id, commentId)).limit(1);
    if (!c) throw notFound();
    const rule = NEXT[input.action];
    if (!rule.from.includes(c.status)) throw new HttpError(409, 'invalid_transition', `Cannot ${input.action} a ${c.status} comment.`);
    const openReports = await tx.select({ id: schema.commentReports.id }).from(schema.commentReports).where(and(eq(schema.commentReports.commentId, commentId), eq(schema.commentReports.status, 'open')));
    if (input.action === 'dismiss' && openReports.length === 0) throw new HttpError(409, 'no_open_reports');
    if (rule.to) {
      const [u] = await tx.update(schema.comments).set({ status: rule.to, updatedAt: new Date() }).where(and(eq(schema.comments.id, commentId), eq(schema.comments.status, c.status))).returning({ id: schema.comments.id });
      if (!u) throw new HttpError(409, 'concurrent_update');
    }
    if (openReports.length) {
      await tx.update(schema.commentReports).set({ status: 'resolved', decision: `${input.action}: ${input.note}`, decidedBy: moderatorId, decidedAt: new Date() }).where(inArray(schema.commentReports.id, openReports.map((r) => r.id)));
    }
    const [parent] = await tx.select({ title: schema.sharedInsights.title }).from(schema.sharedInsights).where(eq(schema.sharedInsights.id, c.sharedInsightId));
    if (input.action !== 'dismiss') {
      await notify(tx, {
        userId: c.authorId,
        type: 'comment_moderation',
        title: `Your comment on “${parent?.title ?? 'a shared contribution'}” was ${rule.label}`,
        body: input.note,
        link: `/community/${c.sharedInsightId}`,
        dedupeKey: `comment-decision:${commentId}:${input.action}:${Date.now()}`,
      });
    }
    await audit(tx, { actorId: moderatorId, action: `comment.${input.action}`, resourceType: 'comment', resourceId: commentId, meta: { from: c.status, to: rule.to ?? c.status, reportsResolved: openReports.length } });
    return { status: rule.to ?? c.status, reportsResolved: openReports.length };
  });
}
