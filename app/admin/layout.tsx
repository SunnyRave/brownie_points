import { PortalShell } from '@/components/portal/PortalShell';
import { Denied } from '@/components/ui';
import { requirePrincipal, guarded } from '@/lib/page';
import { enforce } from '@/lib/policy/enforce';
import { adminResource, mfaStatus } from '@/lib/services/admin';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const p = await requirePrincipal('/admin');
  const r = await guarded(() => enforce(p, 'manage_grants', adminResource));
  if (!r.ok) return <Denied status={r.status} message="The admin console requires the portal administrator grant. Employee status alone is not enough." />;
  const mfa = mfaStatus(p);
  return (
    <PortalShell principal={p} persona="admin" activeLabel="Azentio · Admin" nav={[
      { href: '/admin', label: 'Organisations' },
      { href: '/admin/people', label: 'People & access' },
      { href: '/admin/grants', label: 'Grants' },
      { href: '/admin/settings', label: 'Settings' },
      { href: '/admin/audit', label: 'Audit log' },
    ]}>
      {p.authMethod !== 'microsoft' && <p role="note" className="mb-4 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber">Signed in by email link (no MFA claim). In production, admin writes require a Microsoft session with MFA in the last hour{mfa.mfa ? '' : ''}.</p>}
      {children}
    </PortalShell>
  );
}
