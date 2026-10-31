import { eq, sql } from 'drizzle-orm';
import { schema, type Db, type Tx } from '@/lib/db';
import { rows } from '@/lib/db/rows';
import { loadRefs } from './refs';
import { seedFederated } from './federated';
import { seedEngagement } from './engagement';
import { seedCollab } from './collab';
import { seedEnquiries } from './enquiries';

const MARKER = 'seed_extras_v1';
const ENQUIRIES_MARKER = 'seed_enquiries_v1';

/** Seeds the collaboration + federated demo data in the caller's (system-mode) transaction. */
export async function seedExtras(tx: Tx) {
  const refs = await loadRefs(tx);
  if (!refs.users.admin) return; // not a demo database
  await tx.insert(schema.grants).values({ userId: refs.users.admin.id, grant: 'support_agent', reason: 'Client support desk (demo)', grantedBy: 'bootstrap' });
  await seedEngagement(tx, refs);
  await seedCollab(tx, refs);
  await seedFederated(tx, refs);
  await tx.insert(schema.settings).values({ key: MARKER, value: true }).onConflictDoNothing();
  await seedEnquiriesOnce(tx);
}

async function seedEnquiriesOnce(tx: Tx) {
  const done = await tx.select().from(schema.settings).where(eq(schema.settings.key, ENQUIRIES_MARKER));
  if (done.length) return;
  await seedEnquiries(tx, await loadRefs(tx));
  await tx.insert(schema.settings).values({ key: ENQUIRIES_MARKER, value: true }).onConflictDoNothing();
}

/** Runs seedExtras once on a database that was seeded before these features existed (e.g. the hosted demo). */
export async function seedExtrasIfMissing(db: Db) {
  const done = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from settings where key = ${MARKER}`));
  if ((done[0]?.n ?? 0) > 0) {
    // Databases seeded before the enquiries feature still get its demo rows once.
    await db.transaction(async (txAny) => {
      const tx = txAny as unknown as Tx;
      await tx.execute(sql`select set_config('app.mode', 'system', true)`);
      await seedEnquiriesOnce(tx);
    });
    return false;
  }
  const orgs = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from organisations`));
  if ((orgs[0]?.n ?? 0) === 0) return false;
  await db.transaction(async (txAny) => {
    const tx = txAny as unknown as Tx;
    await tx.execute(sql`select set_config('app.mode', 'system', true)`);
    await seedExtras(tx);
  });
  return true;
}
