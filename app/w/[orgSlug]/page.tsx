import Link from 'next/link';
import { Denied, EmptyState, PageHeader, PrivateLabel, SharedLabel, Stat, fmtDate } from '@/components/ui';
import { IdeaStatusRail } from '@/components/ideas/IdeaStatusRail';
import { requirePrincipal, guarded } from '@/lib/page';
import { workspaceDashboard } from '@/lib/services/workspace';

export default async function WorkspaceDashboard({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const p = await requirePrincipal();
  const r = await guarded(() => workspaceDashboard(p));
  if (!r.ok) return <Denied status={r.status} />;
  const d = r.data;
  const base = `/w/${orgSlug}`;
  const inFlight = (d.counts.submitted ?? 0) + (d.counts.in_review ?? 0) + (d.counts.returned ?? 0);
  return (
    <>
      <PageHeader eyebrow={d.orgName} title={`Welcome, ${p.name.split(' ')[0]}`} description={<span className="flex flex-wrap items-center gap-2">Active organisation: <strong>{d.orgName}</strong> <PrivateLabel text="Workspace private to your organisation" /></span>} actions={<Link href={`${base}/observations/new`} className="btn btn-primary">New observation</Link>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Private drafts" value={d.counts.draft ?? 0} />
        <Stat label="In review / returned" value={inFlight} tone="text-amber" />
        <Stat label="Published (shared)" value={d.counts.published ?? 0} tone="text-teal" />
        <Stat label="Shared in organisation" value={d.counts.org_shared ?? 0} tone="text-violet-text" />
      </div>
      {(d.counts.returned ?? 0) > 0 && <p role="status" className="mt-4 rounded-xl border border-coral/40 bg-coral/10 p-3 text-sm text-coral">A moderator returned {d.counts.returned} contribution(s) for clarification. <Link className="underline" href={`${base}/observations`}>Review</Link></p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="panel-solid p-6">
          <h2 className="text-lg font-semibold">Entitled offerings</h2>
          {d.entitled.length === 0 ? <div className="mt-4"><EmptyState title="No offerings assigned yet" body="Your Azentio contact can enable offerings and sandboxes for your organisation." /></div> : (
            <ul className="mt-4 space-y-3">
              {d.entitled.map((o) => (
                <li key={o.id} className="panel-deep flex items-center justify-between gap-3 p-4">
                  <div><p className="font-semibold">{o.name}</p><p className="text-xs text-ink-3">{o.summary}</p></div>
                  {o.sandboxEnabled ? <Link className="btn btn-ghost btn-sm" href={`${base}/demos`}>Sandbox</Link> : <span className="chip">Demo on request</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel-solid p-6">
          <h2 className="text-lg font-semibold">Upcoming sessions</h2>
          {d.sessions.length === 0 ? <div className="mt-4"><EmptyState title="No sessions scheduled" /></div> : (
            <ul className="mt-4 space-y-3">
              {d.sessions.map((s) => (
                <li key={s.id} className={`${s.audience?.kind === 'tenant' ? 'panel-deep' : 'panel-glass'} p-4`}>
                  <p className="font-semibold">{s.title}</p>
                  <p className="mt-1 text-xs text-ink-3">{fmtDate(s.startsAt)} · {s.audience?.kind === 'tenant' ? 'Invitation-only for your organisation' : s.audience?.kind === 'shared_community' ? 'All client workspaces' : 'Public'}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel-glass mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Improvement ideas</h2><SharedLabel /></div>
        {d.ideas.length === 0 ? <p className="mt-4 text-sm text-ink-3">No ideas have public updates yet.</p> : (
          <ul className="mt-4 space-y-5">
            {d.ideas.map((i) => (
              <li key={i.id}>
                <p className="font-semibold">{i.title}</p>
                <p className="text-xs text-ink-3">{i.ownerTeam} · updated {fmtDate(i.updatedAt)}</p>
                <IdeaStatusRail status={i.status} />
              </li>
            ))}
          </ul>
        )}
        <Link href={`${base}/ideas`} className="btn btn-ghost btn-sm mt-4">All ideas</Link>
      </section>
    </>
  );
}
