import fs from 'node:fs/promises';
import path from 'node:path';
import { and, asc, desc, eq } from 'drizzle-orm';
import { schema, withSystemTx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { can, enforce } from '@/lib/policy/enforce';
import { sign, verifySignature } from '@/lib/crypto';
import { notFound, HttpError } from '@/lib/http';
import { indexDocument } from '@/lib/search';
import { bannerSchema, broadcastSchema } from '@/lib/validation';
import type { Audience, Principal } from '@/lib/policy/types';

type ContentRow = typeof schema.content.$inferSelect;
export const MEDIA_URL_TTL_SEC = 5 * 60;
const MEDIA_DIR = path.join(process.cwd(), 'storage', 'media');

/** Row-level filter: each record is checked individually; records with no audience are denied (AT-03). */
export function visibleTo<T extends { audience: Audience | null }>(principal: Principal | null, rows: T[], type: string) {
  return rows.filter((r) => can(principal, 'read', { type, audience: r.audience }));
}

export async function listOfferings(principal: Principal | null) {
  const rows = await withSystemTx((tx) => tx.select().from(schema.offerings).orderBy(asc(schema.offerings.sortOrder), asc(schema.offerings.name)));
  return visibleTo(principal, rows, 'offering');
}

export async function getOffering(principal: Principal | null, slug: string) {
  const [row] = await withSystemTx((tx) => tx.select().from(schema.offerings).where(eq(schema.offerings.slug, slug)).limit(1));
  if (!row) throw notFound();
  await enforce(principal, 'read', { type: 'offering', id: row.id, audience: row.audience });
  const mediaRows = row.mediaIds.length ? await withSystemTx((tx) => tx.select().from(schema.media)) : [];
  return { ...row, media: visibleTo(principal, mediaRows.filter((m) => row.mediaIds.includes(m.id)), 'media').map((m) => ({ id: m.id, title: m.title, contentType: m.contentType })) };
}

export async function getPage(principal: Principal | null, slug: string) {
  const [row] = await withSystemTx((tx) => tx.select().from(schema.content).where(and(eq(schema.content.type, 'page'), eq(schema.content.slug, slug))).limit(1));
  if (!row || row.status !== 'published') throw notFound();
  await enforce(principal, 'read', { type: 'content', id: row.id, audience: row.audience });
  return row;
}

export async function listContent(principal: Principal | null, type: ContentRow['type']) {
  const rows = await withSystemTx((tx) => tx.select().from(schema.content).where(and(eq(schema.content.type, type), eq(schema.content.status, 'published'))).orderBy(desc(schema.content.updatedAt)));
  return visibleTo(principal, rows, 'content');
}

export async function getContentById(principal: Principal | null, id: string) {
  const [row] = await withSystemTx((tx) => tx.select().from(schema.content).where(eq(schema.content.id, id)).limit(1));
  if (!row) throw notFound();
  await enforce(principal, 'read', { type: 'content', id, audience: row.audience });
  return row;
}

// ───────── Banner (content publishers only) ─────────

export async function getBanner() {
  const [row] = await withSystemTx((tx) => tx.select().from(schema.content).where(and(eq(schema.content.type, 'banner'), eq(schema.content.status, 'published'))).limit(1));
  return row && can(null, 'read', { type: 'content', audience: row.audience }) ? row : null;
}

export async function updateBanner(principal: Principal | null, raw: unknown) {
  await enforce(principal, 'publish_content', { type: 'banner', audience: { kind: 'public' } });
  const input = bannerSchema.parse(raw);
  return withSystemTx(async (tx) => {
    const [existing] = await tx.select().from(schema.content).where(eq(schema.content.type, 'banner')).limit(1);
    const values = { title: input.title, body: input.body, meta: { ctaLabel: input.ctaLabel ?? null, ctaHref: input.ctaHref ?? null }, updatedAt: new Date(), ownerId: principal!.userId };
    if (existing) await tx.update(schema.content).set(values).where(eq(schema.content.id, existing.id));
    else await tx.insert(schema.content).values({ ...values, type: 'banner', audience: { kind: 'public' }, status: 'published' });
    await audit(tx, { actorId: principal!.userId, action: 'content.banner_update', resourceType: 'content', resourceId: existing?.id ?? null });
  });
}

// ───────── Broadcasts ─────────

export async function listBroadcasts(principal: Principal | null) {
  const rows = await withSystemTx((tx) => tx.select().from(schema.broadcasts).orderBy(asc(schema.broadcasts.startsAt)));
  return visibleTo(principal, rows, 'broadcast');
}

export async function getBroadcast(principal: Principal | null, id: string) {
  const [row] = await withSystemTx((tx) => tx.select().from(schema.broadcasts).where(eq(schema.broadcasts.id, id)).limit(1));
  if (!row) throw notFound();
  await enforce(principal, 'read', { type: 'broadcast', id, audience: row.audience });
  return row;
}

function parseAudience(a: string): Audience {
  if (a.startsWith('tenant:')) return { kind: 'tenant', tenantId: a.slice(7) };
  return { kind: a as 'employee' | 'public' | 'shared_community' };
}

/** EMP-05: only content_publisher grant holders configure sessions and recordings. */
export async function upsertBroadcast(principal: Principal | null, id: string | null, raw: unknown) {
  await enforce(principal, 'manage_broadcast', { type: 'broadcast', id, audience: { kind: 'employee' } });
  const input = broadcastSchema.parse(raw);
  return withSystemTx(async (tx) => {
    const values = { title: input.title, description: input.description, startsAt: new Date(input.startsAt), status: input.status, audience: parseAudience(input.audience), updatedAt: new Date() };
    let rowId = id;
    if (id) {
      const updated = await tx.update(schema.broadcasts).set(values).where(eq(schema.broadcasts.id, id)).returning();
      if (!updated.length) throw notFound();
    } else {
      const [row] = await tx.insert(schema.broadcasts).values({ ...values, createdBy: principal!.userId }).returning();
      rowId = row.id;
    }
    await audit(tx, { actorId: principal!.userId, action: id ? 'broadcast.update' : 'broadcast.create', resourceType: 'broadcast', resourceId: rowId, meta: { audience: input.audience } });
    return { id: rowId };
  });
}

// ───────── Media: never served directly; signed URL minted after authorize() ─────────

export async function mintMediaUrl(principal: Principal | null, mediaId: string) {
  const [m] = await withSystemTx((tx) => tx.select().from(schema.media).where(eq(schema.media.id, mediaId)).limit(1));
  if (!m) throw notFound();
  await enforce(principal, 'read', { type: 'media', id: mediaId, audience: m.audience });
  const exp = Math.floor(Date.now() / 1000) + MEDIA_URL_TTL_SEC;
  return { url: `/api/media/file/${mediaId}?exp=${exp}&sig=${sign(`${mediaId}.${exp}`)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export async function readSignedMedia(mediaId: string, exp: string | null, sig: string | null) {
  const expNum = Number(exp);
  if (!exp || !sig || !Number.isFinite(expNum) || !verifySignature(`${mediaId}.${expNum}`, sig)) throw new HttpError(403, 'invalid_signature');
  if (expNum * 1000 < Date.now()) throw new HttpError(403, 'url_expired');
  const [m] = await withSystemTx((tx) => tx.select().from(schema.media).where(eq(schema.media.id, mediaId)).limit(1));
  if (!m) throw notFound();
  const file = path.join(MEDIA_DIR, path.basename(m.storageKey));
  return { body: await fs.readFile(file), contentType: m.contentType };
}

/** Rebuild public + employee search partitions from content and offerings. */
export async function reindexContent() {
  await withSystemTx(async (tx) => {
    const offerings = await tx.select().from(schema.offerings);
    for (const o of offerings) {
      if (o.audience?.kind !== 'public') continue;
      await indexDocument(tx, { audienceKey: 'public', sourceType: 'offering', sourceId: o.id, title: o.name, text: `${o.label}. ${o.tagline} ${o.summary} ${[...o.capabilities, ...o.outcomes].join('. ')}`, url: `/products/${o.slug}` });
    }
    const rows = await tx.select().from(schema.content).where(eq(schema.content.status, 'published'));
    for (const c of rows) {
      const a = c.audience;
      if (!a || c.type === 'banner') continue;
      if (a.kind === 'public') {
        await indexDocument(tx, { audienceKey: 'public', sourceType: 'public_content', sourceId: c.id, title: c.title, text: `${c.summary ?? ''} ${c.body}`, url: c.type === 'page' ? (c.slug === 'home' ? '/' : `/${c.slug}`) : `/insights#${c.id}` });
      } else if (a.kind === 'employee') {
        await indexDocument(tx, { audienceKey: 'employee', sourceType: 'employee_content', sourceId: c.id, title: c.title, text: `${c.summary ?? ''} ${c.body}`, url: `/hub/library/${c.id}` });
      } else if (a.kind === 'tenant') {
        await indexDocument(tx, { audienceKey: `tenant:${a.tenantId}`, sourceType: 'tenant_content', sourceId: c.id, title: c.title, text: `${c.summary ?? ''} ${c.body}`, url: `/w/_/resources#${c.id}` });
      }
    }
    const shared = await tx.select().from(schema.sharedInsights).where(eq(schema.sharedInsights.status, 'published'));
    for (const s of shared) {
      await indexDocument(tx, { audienceKey: 'shared_community', sourceType: 'shared_insight', sourceId: s.id, title: s.title, text: s.body, url: `/community/${s.id}` });
    }
  });
}
