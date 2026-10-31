import { EmptyState, fmtDate } from '@/components/ui';
import { guarded } from '@/lib/page';
import { sandboxFeedbackSummary } from '@/lib/services/playground';
import type { Principal } from '@/lib/policy/types';

const USEFUL = [
  { key: 'yes', label: 'Useful', tone: 'text-teal' },
  { key: 'partly', label: 'Partly', tone: 'text-amber' },
  { key: 'no', label: 'Not useful', tone: 'text-coral' },
] as const;

/** Product owners: what people said after running sandbox and Playground scenarios. De-identified. */
export async function SandboxFeedbackPanel({ principal }: { principal: Principal }) {
  const r = await guarded(() => sandboxFeedbackSummary(principal));
  if (!r.ok) return null;
  return (
    <section aria-labelledby="sbfb-h" className="mt-10">
      <h2 id="sbfb-h" className="text-xl font-semibold">Sandbox feedback</h2>
      <p className="mt-1 text-sm text-ink-3">Structured feedback left after demo and Playground runs, grouped by product and scenario. No names or organisations are shown; comments that look sensitive are withheld.</p>
      {r.data.length === 0 ? (
        <div className="mt-4"><EmptyState title="No feedback yet" body="Feedback appears here after someone runs a sandbox scenario and completes step 5." /></div>
      ) : (
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {r.data.map((g) => (
            <li key={`${g.offeringName}-${g.scenarioId}`} className="panel-solid flex flex-col gap-3 p-5">
              <div>
                <p className="font-semibold">{g.scenarioName}</p>
                <p className="text-xs text-ink-3">{g.offeringName} · {g.responses} response{g.responses === 1 ? '' : 's'}{g.avgClarity !== null ? ` · clarity ${g.avgClarity}/5` : ''}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {USEFUL.map((u) => <span key={u.key} className={`chip ${u.tone}`}>{u.label}: {g.useful[u.key]}</span>)}
              </div>
              {g.comments.length > 0 && (
                <ul className="grid gap-2 text-sm">
                  {g.comments.map((c, i) => (
                    <li key={i} className="rounded-xl bg-surface-deep p-3">
                      <p className={c.withheld ? 'italic text-muted' : 'text-ink-2'}>{c.withheld ? 'Comment withheld: possible sensitive content.' : `“${c.text}”`}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted">{c.source} · {fmtDate(c.at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
