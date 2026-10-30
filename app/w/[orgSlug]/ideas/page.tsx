import { Denied, EmptyState, PageHeader, SharedLabel, fmtDate } from '@/components/ui';
import { IdeaStatusRail } from '@/components/ideas/IdeaStatusRail';
import { requirePrincipal, guarded } from '@/lib/page';
import { listPublicIdeas } from '@/lib/services/ideas';

export default async function Ideas() {
  const p = await requirePrincipal();
  const r = await guarded(() => listPublicIdeas(p));
  if (!r.ok) return <Denied status={r.status} />;
  return (
    <>
      <PageHeader eyebrow="Closing the loop" title="Improvement ideas" description={<span className="flex flex-wrap items-center gap-2">Ideas informed by shared themes, with plain-language status. Statuses are not delivery commitments. <SharedLabel /></span>} />
      {r.data.length === 0 ? <EmptyState title="No ideas with public updates yet" /> : (
        <ul className="grid gap-4">
          {r.data.map((i) => (
            <li key={i.id} className="panel-glass p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{i.title}</h2>
                <span className="chip border-teal/40 text-teal">{i.statusLabel}</span>
              </div>
              <p className="mt-1 text-xs text-ink-3">{i.offering ?? 'Cross-offering'} · Owner: {i.ownerTeam} · Last update {fmtDate(i.updatedAt)}</p>
              <IdeaStatusRail status={i.status} />
              <p className="mt-4 text-sm text-ink-2">{i.publicUpdate}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
