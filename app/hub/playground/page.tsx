import { PageHeader, fmtDateTime } from '@/components/ui';
import { Playground } from '@/components/playground/Playground';
import { requirePrincipal } from '@/lib/page';
import { listOfferings } from '@/lib/services/content';
import { listRuns, SCENARIOS } from '@/lib/services/playground';

export default async function HubPlayground() {
  const p = await requirePrincipal();
  const [offerings, runs] = await Promise.all([listOfferings(p), listRuns(p, 'employee')]);
  return (
    <>
      <PageHeader eyebrow="Employee Playground" title="Playground" description="Choose an offering, inspect synthetic inputs, run a deterministic demonstration, review evidence and leave structured feedback." />
      <Playground context="employee" offerings={offerings.map((o) => ({ id: o.id, slug: o.slug, name: o.name, enabled: true }))} scenarios={SCENARIOS} />
      <section className="mt-8"><h2 className="text-lg font-semibold">Your recent runs</h2>
        <ul className="mt-3 space-y-2">{runs.map((r) => <li key={r.id} className="panel-deep flex justify-between p-3 text-sm"><span>{r.scenarioId} · {(r.outputs as { signal?: string }).signal}{r.feedback ? ' · feedback ✓' : ''}</span><span className="font-mono text-xs text-muted">{fmtDateTime(r.createdAt)}</span></li>)}</ul>
      </section>
    </>
  );
}
