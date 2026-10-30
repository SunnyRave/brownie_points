/**
 * One-command reset: wipes the embedded database (or truncates a managed one) and re-seeds synthetic data.
 * Stop `npm run dev` first when using embedded PGlite (single-process database).
 */
import fs from 'node:fs';
import path from 'node:path';

process.env.AUTO_SEED = '0';
const { getDb, closeDb } = await import('@/lib/db');
const { resetAndSeed } = await import('./seed-data');

if (!process.env.DATABASE_URL) {
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pglite');
  fs.rmSync(dir, { recursive: true, force: true });
}
const db = await getDb();
await resetAndSeed(db);
await closeDb();
console.log('✔ Database reset with synthetic seed data (6 client orgs, demo personas).');
