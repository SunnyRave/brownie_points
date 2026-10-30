import { PageHeader } from '@/components/ui';
import { SettingsAdmin } from '@/components/admin/SettingsAdmin';
import { requirePrincipal } from '@/lib/page';
import { getSettings } from '@/lib/services/admin';
import { isDemoMode, microsoftConfigured } from '@/lib/settings';
import { emailProviderConfigured } from '@/lib/outbox';

export default async function Settings() {
  const p = await requirePrincipal();
  const s = await getSettings(p);
  return (
    <>
      <PageHeader eyebrow="Administration" title="Settings" description="Aggregation threshold and sign-in methods." />
      <SettingsAdmin kThreshold={s.kThreshold} authMethods={s.authMethods} effective={s.effectiveAuthMethods} demo={isDemoMode()} env={{ microsoft: microsoftConfigured(), email: emailProviderConfigured(), llm: !!process.env.ANTHROPIC_API_KEY, db: process.env.DATABASE_URL ? 'Managed Postgres' : 'Embedded PGlite (Postgres)' }} />
    </>
  );
}
