import Link from 'next/link';
import { Scale } from 'lucide-react';
import { guarded } from '@/lib/page';
import { prioritisationAssist } from '@/lib/insights/assist';
import { IDEA_STATUS_LABELS } from '@/lib/validation';
import type { Principal } from '@/lib/policy/types';
import { MethodNote } from './MethodNote';

/** Product owners only (service enforces manage_idea). Explainable score per theme; no contributor/org leaderboards. */
export async function PrioritisationPanel({ principal }: { principal: Principal }) {
  const r = await guarded(() => prioritisationAssist(principal));
  if (!r.ok) return null;
  const { ranked, emerging, note, k } = r.data;
  return (
    <section aria-labelledby="prio-h" className="panel-solid mt-6 p-5 md:p-6">
      <h2 id="prio-h" className="flex items-center gap-2 text-lg font-semibold"><Scale size={16} aria-hidden /> Assisted prioritisation</h2>
      <p role="note" className="mt-2 rounded-xl border border-amber/50 bg-amber/10 px-3 py-2 text-sm text-amber">{note}</p>
      {ranked.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">No theme has evidence from at least {k} distinct organisations yet.</p>
      ) : (
        <ol className="mt-4 grid gap-3">
          {ranked.map((t) => (
            <li key={t.themeId} className="panel-deep p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{t.name}</p>
                <span className="chip" title="Sum of the factor points below (max 100)">Assist score {t.score}/100</span>
              </div>
              <p className="mt-1 text-xs text-ink-3">{t.orgBand} organisations{t.latestPeriod ? ` · latest evidence ${t.latestPeriod}` : ''}</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="text-muted"><tr><th className="py-1 pr-3 font-medium">Factor</th><th className="py-1 pr-3 font-medium">Value</th><th className="py-1 pr-3 font-medium">Points</th><th className="py-1 font-medium">Why</th></tr></thead>
                  <tbody>
                    {t.factors.map((f) => (
                      <tr key={f.key} className="border-t border-line-2 align-top">
                        <td className="py-1.5 pr-3">{f.label}</td>
                        <td className="py-1.5 pr-3 font-mono">{f.value.toFixed(2)}</td>
                        <td className="py-1.5 pr-3 font-mono">{f.points} / {f.weight}</td>
                        <td className="py-1.5 text-ink-3">{f.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {t.ideas.length > 0 && <p className="mt-2 text-xs">Existing ideas: {t.ideas.map((i, n) => <span key={i.id}>{n > 0 && ', '}<Link className="underline-offset-2 hover:underline" href={`/hub/ideas/${i.id}`}>{i.title}</Link> ({IDEA_STATUS_LABELS[i.status as keyof typeof IDEA_STATUS_LABELS] ?? i.status})</span>)}</p>}
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-ink-3">Evidence ({t.evidence.length} shared insights)</summary>
                <ul className="mt-1 grid gap-1">{t.evidence.map((e) => <li key={e.id}><Link className="underline-offset-2 hover:underline" href={`/community/${e.id}`}>{e.title}</Link>{e.period && ` · ${e.period}`}</li>)}</ul>
              </details>
            </li>
          ))}
        </ol>
      )}
      {emerging.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium">Emerging themes (not scored)</p>
          <ul className="mt-1 grid gap-1 text-sm text-ink-3">{emerging.map((e) => <li key={e.themeId}>{e.name} — {e.reason}</li>)}</ul>
        </div>
      )}
      <div className="mt-3"><MethodNote>Score = breadth (35, banded distinct organisations) + recency (20) + reviewer-assessed evidence quality (25; unassessed = neutral) + community “needs evidence” signal (10; neutral under 3 ratings) + not yet addressed by an idea (10). Feedback is read as aggregate counts per theme only.</MethodNote></div>
    </section>
  );
}
