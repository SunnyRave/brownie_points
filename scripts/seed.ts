export {};
process.env.AUTO_SEED = '0';
const { getDb, closeDb } = await import('@/lib/db');
const { seedIfEmpty } = await import('./seed-data');
const db = await getDb();
console.log((await seedIfEmpty(db)) ? '✔ Seeded.' : 'Database already has data; use npm run db:reset to start over.');
await closeDb();
