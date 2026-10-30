import { and, eq, inArray, notExists, sql } from 'drizzle-orm';
import { schema, withSystemTx, type Tx } from '@/lib/db';
import { rows } from '@/lib/db/rows';
import { hasActiveMembership, isEmployee } from '@/lib/policy/authorize';
import type { Principal } from '@/lib/policy/types';

export type SearchDoc = { audienceKey: string; sourceType: string; sourceId: string; title: string; text: string; url: string };

export async function indexDocument(tx: Tx, d: SearchDoc) {
  await tx
    .insert(schema.searchDocuments)
    .values({ ...d, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.searchDocuments.sourceType, schema.searchDocuments.sourceId],
      set: { audienceKey: d.audienceKey, title: d.title, text: d.text, url: d.url, updatedAt: new Date() },
    });
  await tx.delete(schema.retrievalBlocklist).where(eq(schema.retrievalBlocklist.sourceId, d.sourceId));
}

export async function removeFromIndex(tx: Tx, sourceId: string, reason: string) {
  await tx.delete(schema.searchDocuments).where(eq(schema.searchDocuments.sourceId, sourceId));
  await tx.insert(schema.retrievalBlocklist).values({ sourceId, reason }).onConflictDoUpdate({ target: schema.retrievalBlocklist.sourceId, set: { reason, createdAt: new Date() } });
}

/**
 * The caller's audience partitions, computed only from the server-side principal.
 * Clients never get 'employee'; anonymous callers get only 'public'.
 */
export function audienceKeysFor(p: Principal | null): string[] {
  if (!p) return ['public'];
  const keys = ['public'];
  if (isEmployee(p)) keys.push('employee', 'shared_community');
  else if (p.activeTenantId && hasActiveMembership(p, p.activeTenantId, 'client')) keys.push('shared_community', `tenant:${p.activeTenantId}`);
  return keys;
}

export type SearchHit = { id: string; sourceType: string; sourceId: string; title: string; snippet: string; url: string; audience: string; rank: number };

function toTsQuery(q: string) {
  const words = (q.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []).slice(0, 8);
  return words.length ? words.map((w) => `${w}:*`).join(' | ') : null;
}

/**
 * Full-text search filtered by audience partition BEFORE ranking, minus the withdrawal blocklist.
 * The returned count is always results.length (AT-15): no separate count query that could disagree.
 */
export async function search(p: Principal | null, q: string, opts: { limit?: number; sourceTypes?: string[] } = {}): Promise<{ results: SearchHit[]; count: number }> {
  const tsq = toTsQuery(q);
  if (!tsq) return { results: [], count: 0 };
  const keys = audienceKeysFor(p);
  const limit = Math.min(opts.limit ?? 20, 50);
  const doc = schema.searchDocuments;
  const vector = sql`to_tsvector('english', ${doc.title} || ' ' || ${doc.text})`;
  const query = sql`to_tsquery('english', ${tsq})`;
  const results = await withSystemTx(async (tx) => {
    const filters = [
      inArray(doc.audienceKey, keys),
      sql`${vector} @@ ${query}`,
      notExists(tx.select({ x: sql`1` }).from(schema.retrievalBlocklist).where(eq(schema.retrievalBlocklist.sourceId, doc.sourceId))),
    ];
    if (opts.sourceTypes?.length) filters.push(inArray(doc.sourceType, opts.sourceTypes));
    return tx
      .select({
        id: doc.id,
        sourceType: doc.sourceType,
        sourceId: doc.sourceId,
        title: doc.title,
        url: doc.url,
        audience: doc.audienceKey,
        snippet: sql<string>`ts_headline('english', ${doc.text}, ${query}, 'MaxWords=28, MinWords=12, StartSel=<<, StopSel=>>')`,
        rank: sql<number>`ts_rank(${vector}, ${query})`,
      })
      .from(doc)
      .where(and(...filters))
      .orderBy(sql`ts_rank(${vector}, ${query}) desc`)
      .limit(limit);
  });
  return { results, count: results.length };
}

/** Raw text of permitted documents, for AIRA grounding. Same partition + blocklist rules as search(). */
export async function retrieveForAira(p: Principal | null, q: string, limit = 5) {
  const { results } = await search(p, q, { limit, sourceTypes: ['shared_insight', 'public_content', 'offering', 'employee_content'] });
  if (!results.length) return [];
  const texts = await withSystemTx(async (tx) =>
    rows<{ source_id: string; text: string }>(
      await tx.execute(sql`select source_id, text from search_documents where source_id in (${sql.join(results.map((r) => sql`${r.sourceId}`), sql`, `)})`),
    ),
  );
  const bySource = new Map(texts.map((t) => [t.source_id, t.text]));
  return results.map((r) => ({ ...r, text: bySource.get(r.sourceId) ?? '' }));
}
