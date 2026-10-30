import { eq } from 'drizzle-orm';

process.env.PGLITE_DIR = 'memory://';
process.env.AUTO_SEED = '1';
process.env.AUTH_SECRET = 'test-secret';
process.env.AZURE_AD_TENANT_ID = '11111111-2222-3333-4444-555555555555';

export async function db() {
  const mod = await import('@/lib/db');
  await mod.getDb();
  return mod;
}

/** Opens a real DB session for a seeded user and loads the principal exactly as a request would. */
export async function loginAs(email: string, tenantSlug?: string) {
  const { withSystemTx, schema } = await db();
  const { createSession, principalFromToken } = await import('@/lib/auth/session');
  const token = await withSystemTx(async (tx) => {
    const [user] = await tx.select().from(schema.users).where(eq(schema.users.email, email));
    if (!user) throw new Error(`no seeded user ${email}`);
    let activeTenantId: string | null = null;
    if (tenantSlug) {
      const [org] = await tx.select().from(schema.organisations).where(eq(schema.organisations.slug, tenantSlug));
      activeTenantId = org.id;
    }
    return createSession(tx, { userId: user.id, authMethod: 'magiclink', amr: ['otp'], activeTenantId });
  });
  const p = await principalFromToken(token);
  if (!p) throw new Error('principal not loaded');
  return Object.assign(p, { token });
}

export async function orgId(slug: string) {
  const { withSystemTx, schema } = await db();
  const [org] = await withSystemTx((tx) => tx.select().from(schema.organisations).where(eq(schema.organisations.slug, slug)));
  return org.id;
}

export async function expectHttp(promise: Promise<unknown>, status: number, code?: string) {
  const { HttpError } = await import('@/lib/http');
  try {
    await promise;
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    if (e.status !== status) throw new Error(`expected ${status}, got ${e.status} (${e.code})`);
    if (code && e.code !== code) throw new Error(`expected code ${code}, got ${e.code}`);
    return e;
  }
  throw new Error(`expected HttpError ${status}, but promise resolved`);
}
