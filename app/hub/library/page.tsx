import Link from 'next/link';
import { EmployeeLabel, PageHeader, fmtDate } from '@/components/ui';
import { requirePrincipal } from '@/lib/page';
import { listContent } from '@/lib/services/content';

export default async function Library() {
  const p = await requirePrincipal();
  const [docs, notes] = await Promise.all([listContent(p, 'library'), listContent(p, 'release_note')]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader eyebrow="Knowledge" title="Knowledge library" description={<span className="flex flex-wrap items-center gap-2">Every document has an owner and a review date; overdue reviews are flagged. <EmployeeLabel /></span>} />
      <ul className="grid gap-4 md:grid-cols-2">
        {docs.map((d) => {
          const overdue = d.reviewDate && d.reviewDate < today;
          return (
            <li key={d.id}>
              <Link href={`/hub/library/${d.id}`} className="panel-solid block p-5 transition-transform hover:-translate-y-0.5">
                <div className="flex flex-wrap gap-2">{overdue ? <span className="chip border-coral/50 text-coral">Review overdue · {d.reviewDate}</span> : <span className="chip">Review by {d.reviewDate ?? '—'}</span>}</div>
                <h2 className="mt-3 font-semibold">{d.title}</h2>
                <p className="mt-1 text-sm text-ink-3">{d.summary}</p>
              </Link>
            </li>
          );
        })}
      </ul>
      <h2 className="mt-10 text-lg font-semibold">Release notes</h2>
      <ul className="mt-3 space-y-3">{notes.map((n) => <li key={n.id} className={n.audience?.kind === 'employee' ? 'panel-solid p-5' : 'panel-glass p-5'}><p className="font-mono text-xs text-muted">{fmtDate(n.updatedAt)} · {n.audience?.kind === 'employee' ? 'internal' : 'client-facing'}</p><p className="mt-1 font-semibold">{n.title}</p><p className="mt-1 text-sm text-ink-2">{n.body}</p></li>)}</ul>
    </>
  );
}
