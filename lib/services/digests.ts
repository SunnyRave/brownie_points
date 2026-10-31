import { and, eq, gt, inArray } from 'drizzle-orm';
import { schema, withSystemTx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notify, queueEmail } from '@/lib/outbox';
import { enforce } from '@/lib/policy/enforce';
import { getKThreshold } from '@/lib/settings';
import { adminResource } from '@/lib/services/admin';
import { communityAudience, communityHref, themeStats } from '@/lib/services/engagement';
import { digestRunSchema, IDEA_STATUS_LABELS } from '@/lib/validation';
import type { Principal } from '@/lib/policy/types';

/** ISO-8601 week label, e.g. 2026-W44. Used as the idempotency window for digests. */
export function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export type DigestThemeLine = { themeId: string; text: string };

/**
 * "Safe trend digest" (§10): one in-app notification per subscribed user summarising their themes.
 * - Established (≥ k distinct orgs): band + number of new approved items since `since` + idea status changes.
 * - Emerging (< k): no numbers at all — just "new activity" or "no new approved contributions".
 * Idempotent per user per ISO week via outbox dedupe keys. Email is only queued (never reported as delivered).
 */
export async function buildDigests(since: Date, now = new Date()) {
  const week = isoWeek(now);
  return withSystemTx(async (tx) => {
    const k = await getKThreshold(tx);
    const subs = await tx.select({ userId: schema.themeSubscriptions.userId, themeId: schema.themeSubscriptions.themeId }).from(schema.themeSubscriptions);
    const themeIds = [...new Set(subs.map((s) => s.themeId))];
    const themes = themeIds.length ? await tx.select({ id: schema.themes.id, name: schema.themes.name }).from(schema.themes).where(inArray(schema.themes.id, themeIds)) : [];
    const lines = new Map<string, string>();
    for (const t of themes) {
      const stats = await themeStats(tx, t.id, k);
      const fresh = stats.rows.filter((r) => r.publishedAt > since);
      if (!stats.established) {
        lines.set(t.id, `${t.name}: emerging, counts withheld. ${fresh.length > 0 ? 'New activity since your last digest.' : 'No new approved contributions.'}`);
        continue;
      }
      const parts = [`${t.name}: established (${stats.band} contributing organisations).`];
      parts.push(fresh.length > 0 ? `${fresh.length} new approved contribution${fresh.length === 1 ? '' : 's'} since your last digest.` : 'No new approved contributions.');
      const evidenceIds = stats.rows.map((r) => r.id);
      if (evidenceIds.length) {
        const changed = await tx
          .selectDistinct({ id: schema.ideas.id, title: schema.ideas.title, status: schema.ideas.status, publicUpdate: schema.ideas.publicUpdate })
          .from(schema.ideaEvidence)
          .innerJoin(schema.ideas, eq(schema.ideas.id, schema.ideaEvidence.ideaId))
          .where(and(inArray(schema.ideaEvidence.sharedInsightId, evidenceIds), gt(schema.ideas.updatedAt, since)));
        for (const i of changed) if (i.publicUpdate.trim()) parts.push(`Idea “${i.title}” is now ${IDEA_STATUS_LABELS[i.status]}.`);
      }
      lines.set(t.id, parts.join(' '));
    }

    const byUser = new Map<string, string[]>();
    for (const s of subs) if (lines.has(s.themeId)) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s.themeId]);
    const audience = await communityAudience(tx, [...byUser.keys()]);
    const users = byUser.size ? await tx.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(inArray(schema.users.id, [...byUser.keys()])) : [];
    const email = new Map(users.map((u) => [u.id, u.email]));

    let notified = 0;
    let emailsQueued = 0;
    let skipped = 0;
    for (const [userId, ids] of byUser) {
      const a = audience.get(userId);
      if (!a) { skipped++; continue; } // lost community access since subscribing
      const dedupe = `digest:${userId}:${week}`;
      const [already] = await tx.select({ id: schema.outbox.id }).from(schema.outbox).where(eq(schema.outbox.dedupeKey, `inapp:${dedupe}`)).limit(1);
      if (already) { skipped++; continue; }
      const body = ids.map((id) => lines.get(id)!).join('\n');
      const title = `Your theme digest · ${week}`;
      await notify(tx, { userId, type: 'digest', title, body, link: communityHref(a.kind), dedupeKey: dedupe });
      notified++;
      const to = email.get(userId);
      if (to) {
        await queueEmail(tx, { to, subject: `azentio.ai — ${title}`, text: `${body}\n\nCounts appear only as bands once enough organisations contribute. Popularity is not prevalence.`, dedupeKey: dedupe, kind: 'digest', link: communityHref(a.kind) });
        emailsQueued++;
      }
    }
    await audit(tx, { actorId: null, action: 'digest.run', resourceType: 'digest', resourceId: week, meta: { notified, emailsQueued, skipped, since: since.toISOString() } });
    return { week, notified, emailsQueued, skipped };
  });
}

/** Portal-admin trigger. Email entries stay "queued" until a provider accepts them. */
export async function runDigests(principal: Principal | null, raw: unknown) {
  await enforce(principal, 'manage_grants', adminResource);
  const { sinceDays } = digestRunSchema.parse(raw ?? {});
  const since = new Date(Date.now() - (sinceDays ?? 7) * 86400_000);
  const r = await buildDigests(since);
  return { ...r, emailStatus: 'queued' as const };
}
