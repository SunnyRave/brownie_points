import { PortalShell } from '@/components/portal/PortalShell';
import { Denied } from '@/components/ui';
import { requirePrincipal, guarded } from '@/lib/page';
import { enforce } from '@/lib/policy/enforce';

export const dynamic = 'force-dynamic';

export default async function ModerateLayout({ children }: { children: React.ReactNode }) {
  const p = await requirePrincipal('/moderate');
  const r = await guarded(() => enforce(p, 'moderate', { type: 'moderation_queue', audience: { kind: 'grant', grant: 'moderator' } }));
  if (!r.ok) return <Denied status={r.status} message="Moderation requires the learning moderator grant." />;
  return (
    <PortalShell principal={p} persona="moderator" activeLabel="Azentio · Moderation" nav={[{ href: '/moderate', label: 'Review queue' }, { href: '/moderate/reports', label: 'Reports' }]}>
      {children}
    </PortalShell>
  );
}
