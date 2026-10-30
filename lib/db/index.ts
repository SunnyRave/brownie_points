import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import * as schema from './schema';
import { runMigrations } from './migrate';

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

type Holder = { db: Promise<Db> | null; close?: () => Promise<void> };
const g = globalThis as unknown as { __azentioDb?: Holder };
g.__azentioDb ??= { db: null };

/**
 * DATABASE_URL → managed Postgres (postgres.js). Otherwise embedded PGlite (real Postgres in WASM).
 * PGLITE_DIR=memory:// gives an ephemeral database (used by tests).
 */
export function getDb(): Promise<Db> {
  const holder = g.__azentioDb!;
  if (!holder.db) {
    holder.db = (async () => {
      let db: Db;
      if (process.env.DATABASE_URL) {
        const { default: postgres } = await import('postgres');
        const { drizzle } = await import('drizzle-orm/postgres-js');
        const client = postgres(process.env.DATABASE_URL, { max: 10 });
        db = drizzle(client, { schema }) as unknown as Db;
        holder.close = async () => client.end();
        await runMigrations(async (text) => {
          await client.unsafe(text);
        }, db);
      } else {
        const { PGlite } = await import('@electric-sql/pglite');
        const { drizzle } = await import('drizzle-orm/pglite');
        const dir = process.env.PGLITE_DIR ?? `${process.cwd()}/.data/pglite`;
        if (dir !== 'memory://') (await import('node:fs')).mkdirSync(dir, { recursive: true });
        const client = dir === 'memory://' ? new PGlite() : new PGlite(dir);
        await client.waitReady;
        db = drizzle(client, { schema }) as unknown as Db;
        holder.close = async () => client.close();
        await runMigrations(async (text) => {
          await client.exec(text);
        }, db);
      }
      if (process.env.AUTO_SEED !== '0') {
        const { seedIfEmpty } = await import('@/scripts/seed-data');
        await seedIfEmpty(db);
      }
      return db;
    })();
  }
  return holder.db;
}

export async function closeDb() {
  const holder = g.__azentioDb!;
  if (holder.db) {
    await holder.db.catch(() => null);
    await holder.close?.();
  }
  holder.db = null;
  holder.close = undefined;
}

export type DbMode = 'user' | 'moderator' | 'system';
export type DbCtx = { userId: string | null; tenantId: string | null; mode: DbMode };

/**
 * Every query runs inside a transaction as the non-superuser `app_user` role with
 * transaction-local settings consumed by RLS policies. A query that forgets an
 * application-level tenant filter still returns zero foreign rows.
 */
export async function withCtx<T>(ctx: DbCtx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${ctx.userId ?? ''}, true),
                                set_config('app.tenant_id', ${ctx.tenantId ?? ''}, true),
                                set_config('app.mode', ${ctx.mode}, true)`);
    await tx.execute(sql`set local role app_user`);
    return fn(tx as unknown as Tx);
  });
}

/** Client/employee request scoped to the server-side active tenant. */
export const withTenantTx = <T>(userId: string, tenantId: string | null, fn: (tx: Tx) => Promise<T>) =>
  withCtx({ userId, tenantId, mode: 'user' }, fn);

/** Moderator reads: RLS still hides drafts and non-proposed (private/org) observations. */
export const withModeratorTx = <T>(userId: string, fn: (tx: Tx) => Promise<T>) =>
  withCtx({ userId, tenantId: null, mode: 'moderator' }, fn);

/** Server-internal work that already passed authorize(): auth lookups, publication, aggregation. */
export const withSystemTx = <T>(fn: (tx: Tx) => Promise<T>) => withCtx({ userId: null, tenantId: null, mode: 'system' }, fn);

export { schema };
