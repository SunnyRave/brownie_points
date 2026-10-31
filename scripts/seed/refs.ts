import { eq } from 'drizzle-orm';
import { schema, type Tx } from '@/lib/db';
import { DEMO_USERS } from '../seed-data';

/** Looks up seeded rows by stable keys (slugs, emails, names) so extras can seed into an existing database. */
export async function loadRefs(tx: Tx) {
  const orgRows = await tx.select().from(schema.organisations);
  const orgs = Object.fromEntries(orgRows.map((o) => [o.slug, o])) as Record<string, typeof schema.organisations.$inferSelect>;
  const userRows = await tx.select().from(schema.users);
  const byEmail = new Map(userRows.map((u) => [u.email, u]));
  const users = Object.fromEntries(Object.entries(DEMO_USERS).map(([k, email]) => [k, byEmail.get(email)!])) as Record<keyof typeof DEMO_USERS, typeof schema.users.$inferSelect>;
  const background = Object.fromEntries(['cedar', 'atlas', 'bluewater'].map((s) => [s, byEmail.get(`analyst@${s}.example`)!]));
  const themeRows = await tx.select().from(schema.themes);
  const themes = Object.fromEntries(themeRows.map((t) => [t.name, t])) as Record<string, typeof schema.themes.$inferSelect>;
  const offeringRows = await tx.select().from(schema.offerings);
  const offerings = Object.fromEntries(offeringRows.map((o) => [o.slug, o])) as Record<string, typeof schema.offerings.$inferSelect>;
  const shared = await tx.select().from(schema.sharedInsights).where(eq(schema.sharedInsights.status, 'published'));
  return { orgs, users, background, themes, offerings, shared };
}
export type Refs = Awaited<ReturnType<typeof loadRefs>>;
