import { eq } from 'drizzle-orm';
import { schema, withSystemTx, type Tx } from '@/lib/db';

export type AuthMethod = 'microsoft' | 'magiclink';

export async function getSetting<T>(key: string, fallback: T, tx?: Tx): Promise<T> {
  const run = async (t: Tx) => {
    const [row] = await t.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
    return (row?.value as T | undefined) ?? fallback;
  };
  return tx ? run(tx) : withSystemTx(run);
}

export const getKThreshold = (tx?: Tx) => getSetting<number>('k_threshold', 3, tx);

/** Env decides what is possible; the admin setting can only switch methods off. */
export async function getAuthMethods(): Promise<AuthMethod[]> {
  const env = (process.env.AUTH_METHODS ?? 'microsoft,magiclink').split(',').map((s) => s.trim()) as AuthMethod[];
  const configured = await getSetting<AuthMethod[]>('auth_methods', ['microsoft', 'magiclink']);
  return env.filter((m) => configured.includes(m) && (m !== 'microsoft' || microsoftConfigured()));
}

export function microsoftConfigured() {
  return !!(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET && process.env.AZURE_AD_TENANT_ID);
}

export const isDemoMode = () => process.env.DEMO_MODE === '1';
export const appUrl = () => process.env.APP_URL ?? 'http://localhost:3000';
