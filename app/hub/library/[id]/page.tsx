import { Denied, PageHeader, EmployeeLabel } from '@/components/ui';
import { requirePrincipal, guarded } from '@/lib/page';
import { getContentById } from '@/lib/services/content';

export default async function LibraryDoc({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requirePrincipal();
  const r = await guarded(() => getContentById(p, id));
  if (!r.ok) return <Denied status={r.status} />;
  const d = r.data;
  return (
    <>
      <PageHeader eyebrow={d.type.replace('_', ' ')} title={d.title} description={<span className="flex flex-wrap items-center gap-2">{d.summary} <EmployeeLabel /></span>} />
      <article className="panel-solid p-6 leading-relaxed text-ink-2">{d.body}<p className="mt-6 font-mono text-xs text-muted">Review date: {d.reviewDate ?? '—'}</p></article>
    </>
  );
}
