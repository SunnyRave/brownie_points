import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import type { Db } from './index';
import { rows } from './rows';

/** Applies db/migrations/*.sql in name order exactly once. Runs as the connection owner (not app_user). */
export async function runMigrations(exec: (text: string) => Promise<void>, db: Db) {
  await exec(`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`);
  const dir = path.join(process.cwd(), 'db', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set(rows<{ name: string }>(await db.execute(sql`select name from _migrations`)).map((r) => r.name));
  for (const f of files) {
    if (applied.has(f)) continue;
    const text = fs.readFileSync(path.join(dir, f), 'utf8').replaceAll('--> statement-breakpoint', '');
    await exec(`begin;\n${text}\ninsert into _migrations(name) values ('${f}');\ncommit;`);
  }
}
