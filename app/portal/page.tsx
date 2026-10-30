import { redirect } from 'next/navigation';
import { getPrincipal } from '@/lib/auth/session';
import { isEmployee } from '@/lib/policy/authorize';
import { Logo } from '@/components/site/Logo';
import { WorkspaceChooser } from '@/components/portal/WorkspaceSwitcher';

export const dynamic = 'force-dynamic';

/** Routes a signed-in user to the right experience. Never grants anything — pages enforce on their own. */
export default async function Portal() {
  const p = await getPrincipal();
  if (!p) redirect('/login');
  const clients = p.memberships.filter((m) => m.orgType === 'client' && m.status === 'active');
  const active = clients.find((m) => m.orgId === p.activeTenantId);
  if (active) redirect(`/w/${active.orgSlug}`);
  if (isEmployee(p) && clients.length === 0) redirect('/hub');
  if (clients.length === 0) redirect('/access-pending');
  const options: { orgId: string; name: string; slug: string; kind: 'client' | 'azentio' }[] = clients.map((m) => ({ orgId: m.orgId, name: m.orgName, slug: m.orgSlug, kind: 'client' }));
  if (isEmployee(p)) options.unshift({ orgId: p.memberships.find((m) => m.orgType === 'azentio')!.orgId, name: 'Azentio employee hub', slug: 'hub', kind: 'azentio' as const });
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <Logo />
      <div className="panel-glass w-full max-w-md p-8">
        <h1 className="text-2xl font-semibold">Choose a workspace</h1>
        <p className="mt-2 text-sm text-ink-2">You belong to more than one organisation. Data never crosses between workspaces.</p>
        <WorkspaceChooser options={options} />
      </div>
    </main>
  );
}
