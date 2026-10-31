import Link from 'next/link';
import { EmptyState, PageHeader, fmtDateTime } from '@/components/ui';
import { ReportDecision } from '@/components/moderation/ReportDecision';
import { requirePrincipal } from '@/lib/page';
import { listReports } from '@/lib/services/moderation';

export default async function Reports() {
  const p = await requirePrincipal();
  const items = await listReports(p);
  return (
    <>
      <PageHeader eyebrow="Moderation" title="Reports" description="Temporarily unpublish while you investigate, then restore or remove. The contributor is told the decision, never who reported." actions={<Link className="btn btn-ghost btn-sm" href="/moderate/comments#ne-h">Comment reports & “needs evidence” signals</Link>} />
      {items.length === 0 ? <EmptyState title="No reports" /> : (
        <ul className="grid gap-4">
          {items.map((r) => (
            <li key={r.id} className="panel-solid p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2"><span className="chip border-coral/40 text-coral">{r.reason}</span><span className="chip">report {r.status}</span><span className="chip">shared copy: {r.sharedStatus}</span></div>
                <span className="font-mono text-xs text-muted">{fmtDateTime(r.createdAt)}</span>
              </div>
              <p className="mt-3 font-semibold">{r.sharedTitle}</p>
              <p className="mt-1 text-sm text-ink-2">{r.sharedBody}</p>
              {r.details && <p className="mt-2 text-sm text-ink-3">Reporter details: {r.details}</p>}
              {r.decision && <p className="mt-2 text-xs text-ink-3">Last decision: {r.decision}</p>}
              {r.sharedStatus !== 'withdrawn' && r.sharedStatus !== 'removed' && <ReportDecision id={r.id} sharedStatus={r.sharedStatus} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
