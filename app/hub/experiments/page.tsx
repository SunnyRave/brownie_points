import { EmployeeLabel, PageHeader, fmtDate } from '@/components/ui';
import { requirePrincipal } from '@/lib/page';
import { listContent } from '@/lib/services/content';

export default async function Experiments() {
  const p = await requirePrincipal();
  const items = await listContent(p, 'experiment');
  return (
    <>
      <PageHeader eyebrow="Innovation" title="Experiments" description={<span className="flex flex-wrap items-center gap-2">Internal prototype notes, separate from public product information. Never indexed for clients or the public. <EmployeeLabel /></span>} />
      <ul className="grid gap-4 md:grid-cols-2">
        {items.map((e) => (
          <li key={e.id} className="panel-solid p-5">
            <div className="flex items-center justify-between"><span className="chip border-amber/40 text-amber">{String((e.meta as { status?: string }).status ?? 'draft')}</span><span className="font-mono text-xs text-muted">{fmtDate(e.updatedAt)}</span></div>
            <h2 className="mt-3 font-semibold">{e.title}</h2>
            <p className="mt-2 text-sm text-ink-2">{e.body}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
