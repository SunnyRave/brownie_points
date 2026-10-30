import Link from 'next/link';
import { Denied, EmptyState, PageHeader, PrivateLabel, StatePill, Who, fmtDate } from '@/components/ui';
import { requirePrincipal, guarded } from '@/lib/page';
import { listObservations } from '@/lib/services/observations';
import { STATE_LABELS, whoCanSee, type ObservationState } from '@/lib/learning/stateMachine';
import { OBSERVATION_TYPE_LABELS } from '@/lib/validation';

export default async function Observations({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { orgSlug } = await params;
  const tab = (await searchParams).tab === 'org' ? 'org' : 'mine';
  const p = await requirePrincipal();
  const r = await guarded(() => listObservations(p, tab));
  if (!r.ok) return <Denied status={r.status} />;
  const base = `/w/${orgSlug}`;
  const tabs = [
    { key: 'mine', label: 'My observations', href: `${base}/observations` },
    { key: 'org', label: 'Our organisation', href: `${base}/observations?tab=org` },
  ];
  return (
    <>
      <PageHeader eyebrow="Contributions" title="Observations" description="Private organisation knowledge lives here. The cross-client shared feed is a separate, reviewed space." actions={<Link href={`${base}/observations/new`} className="btn btn-primary">New observation</Link>} />
      <nav aria-label="Observation views" className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => <Link key={t.key} href={t.href} aria-current={tab === t.key ? 'page' : undefined} className={`chip min-h-[40px] px-4 text-sm ${tab === t.key ? 'border-accent text-ink' : ''}`}>{t.label}</Link>)}
        <Link href={`${base}/community`} className="chip min-h-[40px] border-violet/40 px-4 text-sm text-violet-text">Shared community →</Link>
      </nav>
      <div className="mb-4"><PrivateLabel text={tab === 'mine' ? 'Your records — drafts are visible only to you' : `Visible to ${p.memberships.find((m) => m.orgId === p.activeTenantId)?.orgName} members only`} /></div>
      {r.data.length === 0 ? (
        <EmptyState title={tab === 'mine' ? 'No observations yet' : 'Nothing shared inside your organisation yet'} body="Start with a private draft. Saving never shares." action={<Link href={`${base}/observations/new`} className="btn btn-primary btn-sm">Write an observation</Link>} />
      ) : (
        <ul className="grid gap-3">
          {r.data.map((o) => (
            <li key={o.id}>
              <Link href={`${base}/observations/${o.id}`} className="panel-solid block p-5 transition-transform hover:-translate-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatePill state={o.state} label={STATE_LABELS[o.state as ObservationState] ?? o.state} />
                  <span className="chip">{OBSERVATION_TYPE_LABELS[o.type as keyof typeof OBSERVATION_TYPE_LABELS]}</span>
                  {o.version > 1 && <span className="chip">v{o.version}</span>}
                  {!o.isMine && <span className="chip">by a colleague</span>}
                </div>
                <p className="mt-3 font-semibold">{o.title}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <Who icon={o.state === 'draft' || o.visibilityIntent === 'private' ? 'lock' : o.state === 'published' ? 'globe' : 'users'}>{whoCanSee(o.visibilityIntent as 'private', o.state as ObservationState).label}</Who>
                  <span className="font-mono text-xs text-muted">{fmtDate(o.updatedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
