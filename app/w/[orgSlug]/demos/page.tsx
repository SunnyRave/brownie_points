import { Denied, PageHeader, fmtDateTime } from '@/components/ui';
import { Playground } from '@/components/playground/Playground';
import { requirePrincipal, guarded } from '@/lib/page';
import { entitledSandboxOfferings } from '@/lib/services/workspace';
import { listRuns, SCENARIOS } from '@/lib/services/playground';

export default async function Demos() {
  const p = await requirePrincipal();
  const r = await guarded(async () => ({ offerings: await entitledSandboxOfferings(p), runs: await listRuns(p, 'client') }));
  if (!r.ok) return <Denied status={r.status} />;
  return (
    <>
      <PageHeader eyebrow="Sandboxes" title="Demos & sandboxes" description="Entitled sandboxes with synthetic data. Runs are private to you within this workspace." />
      <Playground context="client" offerings={r.data.offerings.map((o) => ({ id: o.id, slug: o.slug, name: o.name, enabled: o.sandboxEnabled }))} scenarios={SCENARIOS} />
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Your recent runs</h2>
        {r.data.runs.length === 0 ? <p className="mt-2 text-sm text-ink-3">No runs yet.</p> : (
          <ul className="mt-3 space-y-2">{r.data.runs.map((run) => <li key={run.id} className="panel-deep flex justify-between p-3 text-sm"><span>{run.scenarioId} · {(run.outputs as { signal?: string }).signal}</span><span className="font-mono text-xs text-muted">{fmtDateTime(run.createdAt)}</span></li>)}</ul>
        )}
      </section>
    </>
  );
}
