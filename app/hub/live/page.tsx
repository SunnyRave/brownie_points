import { EmployeeLabel, PageHeader, SharedLabel, PrivateLabel, fmtDateTime } from '@/components/ui';
import { MediaViewer } from '@/components/MediaViewer';
import { requirePrincipal } from '@/lib/page';
import { listBroadcasts } from '@/lib/services/content';
import { hasGrant } from '@/lib/policy/authorize';
import Link from 'next/link';

export default async function Live() {
  const p = await requirePrincipal();
  const all = await listBroadcasts(p);
  const internal = all.filter((b) => b.audience?.kind === 'employee');
  return (
    <>
      <PageHeader eyebrow="Live" title="Live sessions & recordings" description={<span className="flex flex-wrap items-center gap-2">Internal broadcasts are restricted to the employee audience — enforced on the API and the media URL. <EmployeeLabel /></span>} actions={hasGrant(p, 'content_publisher') ? <Link className="btn btn-primary" href="/hub/publish">Configure sessions</Link> : <span className="chip text-muted">Read-only · publishing requires a grant</span>} />
      <div className="grid gap-5 lg:grid-cols-2">
        {internal.map((b) => (
          <article key={b.id} className="panel-solid p-5">
            <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{b.title}</h2><span className={`chip ${b.status === 'live' ? 'border-coral/50 text-coral' : ''}`}>{b.status}</span></div>
            <p className="mt-1 text-sm text-ink-3">{b.description}</p>
            <p className="mt-2 font-mono text-xs text-muted">{fmtDateTime(b.startsAt)}</p>
            {b.recordingMediaId && <div className="mt-4"><MediaViewer id={b.recordingMediaId} title="Recording (employee-only)" /></div>}
          </article>
        ))}
      </div>
      <h2 className="mt-10 text-lg font-semibold">Client & public sessions you can see</h2>
      <ul className="mt-3 space-y-2">
        {all.filter((b) => b.audience?.kind !== 'employee').map((b) => (
          <li key={b.id} className="panel-deep flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span>{b.title}</span>{b.audience?.kind === 'shared_community' ? <SharedLabel /> : b.audience?.kind === 'public' ? <span className="chip">Public</span> : <PrivateLabel text="Single client" />}</li>
        ))}
      </ul>
    </>
  );
}
