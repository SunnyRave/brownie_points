import { Denied, PageHeader, SharedLabel, fmtDateTime } from '@/components/ui';
import { IdeaStatusRail } from '@/components/ideas/IdeaStatusRail';
import { IdeaStatusEditor } from '@/components/ideas/IdeaStatusEditor';
import { requirePrincipal, guarded } from '@/lib/page';
import { getIdeaForOwner } from '@/lib/services/ideas';

export default async function IdeaDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requirePrincipal();
  const r = await guarded(() => getIdeaForOwner(p, id));
  if (!r.ok) return <Denied status={r.status} message="Only the assigned product owner can manage this idea." />;
  const { idea, evidence, history } = r.data;
  return (
    <>
      <PageHeader eyebrow={`Owner: ${idea.ownerTeam}`} title={idea.title} description={idea.problem} />
      <IdeaStatusRail status={idea.status} />
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <section className="panel-solid p-6"><h2 className="font-semibold">Proposed outcome</h2><p className="mt-2 text-ink-2">{idea.proposedOutcome}</p><p className="mt-4 text-xs text-muted">Priority (internal): {idea.priority}</p></section>
          <section className="panel-glass p-6">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Linked evidence ({evidence.length})</h2><SharedLabel /></div>
            <p className="mt-1 text-xs text-ink-3">Your assignment grants access only to these approved, de-identified contributions.</p>
            <ul className="mt-4 space-y-3">{evidence.map((e) => <li key={e.id} className="rounded-xl border border-violet/25 p-4"><p className="font-medium">{e.title}</p><p className="mt-1 text-sm text-ink-2">{e.body}</p><p className="mt-2 font-mono text-[11px] text-muted">{e.region} · {e.period}</p></li>)}</ul>
          </section>
          <section className="panel-solid p-6"><h2 className="font-semibold">Audit trail</h2><ul className="mt-3 space-y-2 text-sm">{history.map((h, i) => <li key={i} className="flex justify-between gap-3"><span>{h.action} {JSON.stringify(h.meta)}</span><span className="font-mono text-xs text-muted">{fmtDateTime(h.at)}</span></li>)}</ul></section>
        </div>
        <IdeaStatusEditor id={idea.id} status={idea.status} publicUpdate={idea.publicUpdate} internalNotes={idea.internalNotes} />
      </div>
    </>
  );
}
