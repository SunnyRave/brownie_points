import { PortalShell } from '@/components/portal/PortalShell';
import { Denied } from '@/components/ui';
import { SwitchPrompt } from '@/components/portal/SwitchPrompt';
import { requirePrincipal } from '@/lib/page';

export const dynamic = 'force-dynamic';

/**
 * The URL slug never grants access. The workspace shown is the server-side active tenant; a URL for
 * another org the user belongs to asks for an explicit switch; any other org is simply denied.
 */
export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const p = await requirePrincipal(`/w/${orgSlug}`);
  const target = p.memberships.find((m) => m.orgSlug === orgSlug && m.orgType === 'client' && m.status === 'active');
  if (!target) return <Denied status={403} />;
  if (target.orgId !== p.activeTenantId) return <SwitchPrompt orgId={target.orgId} orgName={target.orgName} />;
  const base = `/w/${orgSlug}`;
  const nav = [
    { href: base, label: 'Dashboard' },
    { href: `${base}/demos`, label: 'Demos & sandboxes' },
    { href: `${base}/observations`, label: 'Observations' },
    { href: `${base}/community`, label: 'Shared community' },
    { href: `${base}/ideas`, label: 'Improvement ideas' },
    { href: `${base}/resources`, label: 'Briefings & sessions' },
    { href: `${base}/saved`, label: 'Saved & bookmarks' },
    { href: `${base}/support`, label: 'Support' },
    ...(target.role === 'client_admin' ? [{ href: `${base}/team`, label: 'Team & invitations' }] : []),
  ];
  return (
    <PortalShell principal={p} persona="client" nav={nav} activeLabel={target.orgName}>
      {children}
    </PortalShell>
  );
}
