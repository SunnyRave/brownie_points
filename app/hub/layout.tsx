import { PortalShell } from '@/components/portal/PortalShell';
import { Denied } from '@/components/ui';
import { requirePrincipal, guarded } from '@/lib/page';
import { enforce } from '@/lib/policy/enforce';
import { hasGrant } from '@/lib/policy/authorize';

export const dynamic = 'force-dynamic';

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const p = await requirePrincipal('/hub');
  const r = await guarded(() => enforce(p, 'read', { type: 'employee_hub', audience: { kind: 'employee' } }));
  if (!r.ok) return <Denied status={r.status} message="The employee hub requires a verified Azentio identity and an approved employee membership." />;
  const nav = [
    { href: '/hub', label: 'Dashboard' },
    { href: '/hub/playground', label: 'Playground' },
    { href: '/hub/live', label: 'Live & recordings' },
    { href: '/hub/experiments', label: 'Experiments' },
    { href: '/hub/library', label: 'Knowledge library' },
    { href: '/hub/community', label: 'Collective learning' },
    { href: '/hub/ideas', label: 'Improvement ideas' },
    { href: '/hub/teams', label: 'Hackathon team spaces' },
    { href: '/hub/saved', label: 'Saved & bookmarks' },
    { href: '/hub/federated', label: 'Federated programme (P2)' },
    ...(hasGrant(p, 'support_agent') ? [{ href: '/hub/support', label: 'Client support desk' }] : []),
    ...(hasGrant(p, 'content_publisher') ? [{ href: '/hub/publish', label: 'Publishing' }] : []),
  ];
  return <PortalShell principal={p} persona="employee" nav={nav} activeLabel="Azentio">{children}</PortalShell>;
}
