import { Denied, PageHeader, EmptyState, PrivateLabel, SharedLabel, fmtDate } from '@/components/ui';
import { MediaViewer } from '@/components/MediaViewer';
import { requirePrincipal, guarded } from '@/lib/page';
import { workspaceResources } from '@/lib/services/workspace';

export default async function Resources() {
  const p = await requirePrincipal();
  const r = await guarded(() => workspaceResources(p));
  if (!r.ok) return <Denied status={r.status} />;
  const { briefings, notes, sessions } = r.data;
  return (
    <>
      <PageHeader eyebrow="Resources" title="Briefings & sessions" description="Client-specific briefings, invitation-only webinars and release notes." />
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">Briefings <PrivateLabel /></h2>
          {briefings.length === 0 ? <EmptyState title="No briefings yet" /> : briefings.map((b) => (
            <article key={b.id} id={b.id} className="panel-solid mb-3 p-5"><h3 className="font-semibold">{b.title}</h3><p className="mt-2 text-sm text-ink-2">{b.body}</p></article>
          ))}
        </section>
        <section>
          <h2 className="mb-3 text-lg font-semibold">Sessions & recordings</h2>
          {sessions.length === 0 ? <EmptyState title="No sessions" /> : sessions.map((s) => (
            <article key={s.id} className={`${s.audience?.kind === 'tenant' ? 'panel-solid' : 'panel-glass'} mb-3 p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{s.title}</h3>{s.audience?.kind === 'tenant' ? <PrivateLabel text="Invitation-only" /> : <SharedLabel />}</div>
              <p className="mt-1 text-xs text-ink-3">{fmtDate(s.startsAt)} · {s.status}</p>
              {s.recordingMediaId && <div className="mt-3"><MediaViewer id={s.recordingMediaId} title="Recording" /></div>}
            </article>
          ))}
        </section>
      </div>
      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Release notes</h2>
        {notes.map((n) => <article key={n.id} className="panel-glass mb-3 p-5"><p className="font-mono text-xs text-muted">{fmtDate(n.updatedAt)}</p><h3 className="mt-1 font-semibold">{n.title}</h3><p className="mt-2 text-sm text-ink-2">{n.body}</p></article>)}
      </section>
    </>
  );
}
