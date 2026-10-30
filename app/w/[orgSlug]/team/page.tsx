import { Denied, PageHeader, PrivateLabel } from '@/components/ui';
import { TeamManager } from '@/components/team/TeamManager';
import { requirePrincipal, guarded } from '@/lib/page';
import { listTeam } from '@/lib/auth/invitations';
import { enforce } from '@/lib/policy/enforce';

export default async function Team() {
  const p = await requirePrincipal();
  const r = await guarded(async () => {
    await enforce(p, 'invite_member', { type: 'team', audience: p.activeTenantId ? { kind: 'tenant', tenantId: p.activeTenantId } : null });
    return listTeam(p);
  });
  if (!r.ok) return <Denied status={r.status} message="Only client administrators manage the team." />;
  return (
    <>
      <PageHeader eyebrow="Administration" title="Team & invitations" description={<span className="flex flex-wrap items-center gap-2">Invite colleagues and manage client roles within your own organisation. <PrivateLabel /></span>} />
      <TeamManager
        selfId={p.userId}
        members={r.data.members.map((m) => ({ ...m, since: m.since.toISOString() }))}
        invitations={r.data.invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, state: i.state, expiresAt: i.expiresAt.toISOString() }))}
      />
    </>
  );
}
