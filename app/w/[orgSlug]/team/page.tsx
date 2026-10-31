import { Denied, PageHeader, PrivateLabel } from '@/components/ui';
import { TeamManager } from '@/components/team/TeamManager';
import { requirePrincipal, guarded } from '@/lib/page';
import { listTeam } from '@/lib/auth/invitations';
import { enforce } from '@/lib/policy/enforce';
import { EnrolmentPanel } from '@/components/federated/EnrolmentPanel';
import { getMyEnrolment } from '@/lib/federated/service';

export default async function Team() {
  const p = await requirePrincipal();
  const r = await guarded(async () => {
    await enforce(p, 'invite_member', { type: 'team', audience: p.activeTenantId ? { kind: 'tenant', tenantId: p.activeTenantId } : null });
    const [team, fl] = await Promise.all([listTeam(p), getMyEnrolment(p)]);
    return { ...team, fl };
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
      <div className="mt-6">
        <EnrolmentPanel initial={{ ...r.data.fl, consentedAt: 'consentedAt' in r.data.fl ? r.data.fl.consentedAt?.toISOString() : null, withdrawnAt: 'withdrawnAt' in r.data.fl ? (r.data.fl.withdrawnAt?.toISOString() ?? null) : null }} />
      </div>
    </>
  );
}
