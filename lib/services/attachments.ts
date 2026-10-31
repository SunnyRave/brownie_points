import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import { schema, withModeratorTx, withTenantTx, type Tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { enforce } from '@/lib/policy/enforce';
import { forbidden, HttpError, notFound } from '@/lib/http';
import type { Principal } from '@/lib/policy/types';

/**
 * OBS-09 attachments on private observations.
 * - Allow-listed types detected from the file's bytes (magic numbers / UTF-8 text), never trusted from the
 *   browser's Content-Type or the extension alone; size and per-record count limits.
 * - Stored privately outside public/ under a random key; the user's filename never touches the path.
 * - Same audience as the parent record: every list/download re-checks the observation's visibility (RLS
 *   subquery + an explicit app-level mirror of the observations policy).
 * - Never copied into shared_insights: a published shared copy contains only reviewed fields.
 */

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MAX_COUNT = 5;
export const ATTACHMENT_TYPES = {
  pdf: { contentType: 'application/pdf', ext: ['pdf'] },
  png: { contentType: 'image/png', ext: ['png'] },
  jpeg: { contentType: 'image/jpeg', ext: ['jpg', 'jpeg'] },
  csv: { contentType: 'text/csv', ext: ['csv'] },
  txt: { contentType: 'text/plain', ext: ['txt'] },
} as const;
export type AttachmentKind = keyof typeof ATTACHMENT_TYPES;
export const ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.csv,.txt';

const EDITABLE_STATES = new Set(['draft', 'returned']);

function storageRoot() {
  return process.env.ATTACHMENT_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'attachments');
}
function filePath(tenantId: string, storageKey: string) {
  // Both segments are server-generated; basename() is a belt-and-braces guard against traversal.
  return path.join(storageRoot(), path.basename(tenantId), path.basename(storageKey));
}

/** Strips paths/control characters and keeps a conservative character set; the extension is preserved. */
export function safeFilename(name: string) {
  const base = (name.split(/[\\/]/).pop() ?? '').normalize('NFKC');
  const cleaned = base.replace(/[^A-Za-z0-9._ -]+/g, '_').replace(/\s+/g, ' ').replace(/^[.\s]+/, '').trim();
  const trimmed = cleaned.length > 100 ? cleaned.slice(0, 80) + cleaned.slice(cleaned.lastIndexOf('.')) : cleaned;
  return trimmed || 'attachment';
}

const startsWith = (b: Uint8Array, sig: number[]) => b.length >= sig.length && sig.every((v, i) => b[i] === v);

/** Content sniffing: returns the detected kind or null. The extension must agree with the bytes. */
export function detectKind(bytes: Uint8Array, filename: string): AttachmentKind | null {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase() : '';
  let kind: AttachmentKind | null = null;
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) kind = 'pdf'; // %PDF-
  else if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) kind = 'png';
  else if (startsWith(bytes, [0xff, 0xd8, 0xff])) kind = 'jpeg';
  else if (ext === 'csv' || ext === 'txt') {
    // Plain text: valid UTF-8, no NUL bytes, no other binary control characters.
    if (bytes.length === 0) return null;
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (/[\u0000-\u0008\u000E-\u001F\u007F]/.test(text)) return null;
    } catch {
      return null;
    }
    kind = ext;
  }
  if (!kind) return null;
  return (ATTACHMENT_TYPES[kind].ext as readonly string[]).includes(ext) ? kind : null;
}

type Obs = typeof schema.observations.$inferSelect;
type Att = typeof schema.observationAttachments.$inferSelect;

/** App-level mirror of obs_user_select: the author, or org members once the record is org-visible and not a draft. */
function visibleToMember(obs: Obs, userId: string) {
  return obs.authorId === userId || (['org', 'propose_shared'].includes(obs.visibilityIntent) && obs.state !== 'draft');
}
/** App-level mirror of obs_moderator_select: proposed for sharing and no longer a draft. */
function visibleToModerator(obs: Obs) {
  return obs.visibilityIntent === 'propose_shared' && obs.state !== 'draft';
}

function dto(a: Att, viewerId: string, obs: Obs) {
  return {
    id: a.id,
    filename: a.filename,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    sha256: a.sha256,
    createdAt: a.createdAt.toISOString(),
    canDelete: a.uploadedBy === viewerId && obs.authorId === viewerId && EDITABLE_STATES.has(obs.state),
  };
}
export type AttachmentDTO = ReturnType<typeof dto>;

async function tenantOf(principal: Principal | null, action: 'read' | 'update' | 'delete', id: string) {
  const tenantId = principal?.activeTenantId ?? null;
  await enforce(principal, action, { type: 'observation_attachment', id, audience: tenantId ? { kind: 'tenant', tenantId } : null });
  return { principal: principal!, tenantId: tenantId! };
}

async function loadVisibleObservation(tx: Tx, id: string, userId: string) {
  const [obs] = await tx.select().from(schema.observations).where(eq(schema.observations.id, id)).limit(1);
  if (!obs || !visibleToMember(obs, userId)) throw notFound();
  return obs;
}

export async function listAttachments(principalIn: Principal | null, observationId: string) {
  const { principal, tenantId } = await tenantOf(principalIn, 'read', observationId);
  return withTenantTx(principal.userId, tenantId, async (tx) => {
    const obs = await loadVisibleObservation(tx, observationId, principal.userId);
    const rows = await tx.select().from(schema.observationAttachments).where(eq(schema.observationAttachments.observationId, observationId)).orderBy(asc(schema.observationAttachments.createdAt));
    return {
      attachments: rows.map((a) => dto(a, principal.userId, obs)),
      canUpload: obs.authorId === principal.userId && EDITABLE_STATES.has(obs.state) && rows.length < ATTACHMENT_MAX_COUNT,
      limits: { maxBytes: ATTACHMENT_MAX_BYTES, maxCount: ATTACHMENT_MAX_COUNT, accept: ATTACHMENT_ACCEPT },
    };
  });
}

export async function uploadAttachment(principalIn: Principal | null, observationId: string, file: { filename: string; bytes: Uint8Array }) {
  const { principal, tenantId } = await tenantOf(principalIn, 'update', observationId);
  if (file.bytes.length > ATTACHMENT_MAX_BYTES) throw new HttpError(413, 'attachment_too_large', `Attachments are limited to ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB.`);
  if (file.bytes.length === 0) throw new HttpError(400, 'attachment_empty', 'The file is empty.');
  const filename = safeFilename(file.filename);
  const kind = detectKind(file.bytes, filename);
  if (!kind) throw new HttpError(415, 'attachment_type_not_allowed', 'Only PDF, PNG, JPEG, CSV and plain-text files are accepted, and the file contents must match the extension.');
  const contentType = ATTACHMENT_TYPES[kind].contentType;
  const sha256 = createHash('sha256').update(file.bytes).digest('hex');
  const storageKey = randomBytes(18).toString('hex');
  const dest = filePath(tenantId, storageKey);
  let written = false;
  try {
    return await withTenantTx(principal.userId, tenantId, async (tx) => {
      const obs = await loadVisibleObservation(tx, observationId, principal.userId);
      if (obs.authorId !== principal.userId) throw forbidden('not_author', 'Only the author can attach files.');
      if (!EDITABLE_STATES.has(obs.state)) throw new HttpError(409, 'attachments_locked', 'Files can only be added while the record is a draft or returned for changes.');
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.observationAttachments).where(eq(schema.observationAttachments.observationId, observationId));
      if (n >= ATTACHMENT_MAX_COUNT) throw new HttpError(409, 'attachment_limit', `A record can have at most ${ATTACHMENT_MAX_COUNT} attachments.`);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, file.bytes, { mode: 0o600 });
      written = true;
      const [row] = await tx
        .insert(schema.observationAttachments)
        .values({ observationId, tenantId, uploadedBy: principal.userId, filename, contentType, sizeBytes: file.bytes.length, sha256, storageKey })
        .returning();
      await audit(tx, { actorId: principal.userId, action: 'attachment.upload', resourceType: 'observation_attachment', resourceId: row.id, tenantId, meta: { observationId, contentType, sizeBytes: row.sizeBytes, sha256 } });
      return dto(row, principal.userId, obs);
    });
  } catch (e) {
    if (written) await fs.rm(dest, { force: true }).catch(() => undefined);
    throw e;
  }
}

async function readStored(a: Att) {
  try {
    return await fs.readFile(filePath(a.tenantId, a.storageKey));
  } catch {
    throw new HttpError(410, 'attachment_missing', 'The stored file is no longer available.');
  }
}

/** Every download re-runs the visibility check against the parent observation in the active tenant. */
export async function downloadAttachment(principalIn: Principal | null, attachmentId: string) {
  const { principal, tenantId } = await tenantOf(principalIn, 'read', attachmentId);
  const a = await withTenantTx(principal.userId, tenantId, async (tx) => {
    const [a] = await tx.select().from(schema.observationAttachments).where(eq(schema.observationAttachments.id, attachmentId)).limit(1);
    if (!a || a.tenantId !== tenantId) throw notFound();
    await loadVisibleObservation(tx, a.observationId, principal.userId);
    await audit(tx, { actorId: principal.userId, action: 'attachment.download', resourceType: 'observation_attachment', resourceId: a.id, tenantId });
    return a;
  });
  return { body: await readStored(a), filename: a.filename, contentType: a.contentType };
}

export async function deleteAttachment(principalIn: Principal | null, attachmentId: string) {
  const { principal, tenantId } = await tenantOf(principalIn, 'delete', attachmentId);
  const a = await withTenantTx(principal.userId, tenantId, async (tx) => {
    const [a] = await tx.select().from(schema.observationAttachments).where(eq(schema.observationAttachments.id, attachmentId)).limit(1);
    if (!a || a.tenantId !== tenantId) throw notFound();
    const obs = await loadVisibleObservation(tx, a.observationId, principal.userId);
    if (a.uploadedBy !== principal.userId || obs.authorId !== principal.userId) throw forbidden('not_author', 'Only the author can remove files.');
    if (!EDITABLE_STATES.has(obs.state)) throw new HttpError(409, 'attachments_locked', 'Files can only be removed while the record is a draft or returned for changes.');
    const removed = await tx.delete(schema.observationAttachments).where(eq(schema.observationAttachments.id, attachmentId)).returning({ id: schema.observationAttachments.id });
    if (!removed.length) throw new HttpError(409, 'attachments_locked');
    await audit(tx, { actorId: principal.userId, action: 'attachment.delete', resourceType: 'observation_attachment', resourceId: a.id, tenantId, meta: { observationId: a.observationId, sha256: a.sha256 } });
    return a;
  });
  await fs.rm(filePath(a.tenantId, a.storageKey), { force: true }).catch(() => undefined);
  return { ok: true };
}

// ───────── Moderators: only for records RLS lets them see (proposed for sharing, past draft) ─────────

const moderatorResource = (id: string) => ({ type: 'observation_attachment', id, audience: { kind: 'grant' as const, grant: 'moderator' as const } });

export async function listAttachmentsForModerator(principal: Principal | null, observationId: string) {
  await enforce(principal, 'moderate', moderatorResource(observationId));
  return withModeratorTx(principal!.userId, async (tx) => {
    const [obs] = await tx.select().from(schema.observations).where(eq(schema.observations.id, observationId)).limit(1);
    if (!obs || !visibleToModerator(obs)) throw notFound();
    const rows = await tx.select().from(schema.observationAttachments).where(eq(schema.observationAttachments.observationId, observationId)).orderBy(asc(schema.observationAttachments.createdAt));
    return rows.map((a) => ({ id: a.id, filename: a.filename, contentType: a.contentType, sizeBytes: a.sizeBytes, sha256: a.sha256, createdAt: a.createdAt.toISOString() }));
  });
}
export type ModeratorAttachmentDTO = Awaited<ReturnType<typeof listAttachmentsForModerator>>[number];

export async function downloadAttachmentForModerator(principal: Principal | null, attachmentId: string) {
  await enforce(principal, 'moderate', moderatorResource(attachmentId));
  const a = await withModeratorTx(principal!.userId, async (tx) => {
    const [a] = await tx.select().from(schema.observationAttachments).where(eq(schema.observationAttachments.id, attachmentId)).limit(1);
    if (!a) throw notFound();
    const [obs] = await tx.select().from(schema.observations).where(eq(schema.observations.id, a.observationId)).limit(1);
    if (!obs || !visibleToModerator(obs)) throw notFound();
    await audit(tx, { actorId: principal!.userId, action: 'attachment.moderator_download', resourceType: 'observation_attachment', resourceId: a.id, tenantId: a.tenantId, meta: { observationId: a.observationId } });
    return a;
  });
  return { body: await readStored(a), filename: a.filename, contentType: a.contentType };
}

/** Shared response for both download routes: always a download, never rendered inline. */
export function attachmentResponse(f: { body: Buffer; filename: string; contentType: string }) {
  const ascii = f.filename.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/"/g, '');
  return new Response(new Uint8Array(f.body), {
    headers: {
      'Content-Type': f.contentType,
      'Content-Length': String(f.body.length),
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
