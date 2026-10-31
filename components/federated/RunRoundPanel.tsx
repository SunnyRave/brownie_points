'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Play } from 'lucide-react';
import { api, errorText } from '@/lib/client';

/** Portal-admin control. The server enforces run_federated regardless of whether this renders. */
export function RunRoundPanel({ enrolled, minCohort, base }: { enrolled: number; minCohort: number; base: string | null }) {
  const router = useRouter();
  // With few participants, dropout + poisoning together would (correctly) abort on minimum cohort.
  const [s, setS] = useState({ dropout: enrolled - 2 >= minCohort, poison: true, forged: true });
  const [dp, setDp] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const honest = enrolled - (s.dropout ? 1 : 0) - (s.poison ? 1 : 0);

  return (
    <section className="panel-solid p-6" aria-labelledby="run-h">
      <h2 id="run-h" className="font-semibold">Run an aggregation round</h2>
      <p className="mt-1 text-sm text-ink-3">Invites every enrolled participant to train locally from the deployed model <span className="font-mono">{base ?? '—'}</span>. The result is only a candidate.</p>
      <fieldset className="mt-4 grid gap-2 text-sm md:grid-cols-3">
        <legend className="label">Simulated fault scenarios</legend>
        {([
          ['dropout', 'Dropout — one client times out'],
          ['poison', 'Poisoning — one compromised client sends a flipped, amplified update'],
          ['forged', 'Forged sender — unregistered key injects an update'],
        ] as const).map(([k, label]) => (
          <label key={k} className="flex items-start gap-2 rounded-xl border border-line p-3">
            <input type="checkbox" checked={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.checked })} className="mt-1" />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr] md:items-end">
        <div>
          <label className="label" htmlFor="dp">DP noise multiplier (sketch)</label>
          <input id="dp" type="number" min={0} max={2} step={0.1} value={dp} onChange={(e) => setDp(Number(e.target.value))} className="input" />
        </div>
        <p className="hint">0 = off (default). Adds Gaussian noise to the clipped aggregate — simulated, no privacy accounting, not a formal DP guarantee.</p>
      </div>
      <p className={`mt-3 text-sm ${honest < minCohort ? 'text-amber' : 'text-ink-3'}`}>
        {enrolled} enrolled → up to {honest} honest update(s). Minimum cohort is {minCohort}{honest < minCohort ? ' — this round is expected to abort with no model registered.' : '.'}
      </p>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-3 rounded-xl border p-3 text-sm ${msg.ok ? 'border-teal/40 bg-teal/10 text-teal' : 'border-coral/40 bg-coral/10 text-coral'}`}>{msg.text}</p>}
      <button className="btn btn-primary mt-4" disabled={busy} onClick={async () => {
        setBusy(true);
        setMsg(null);
        try {
          const r = await api<{ roundNo: number; status: string; modelVersion: string | null; abortReason: string | null }>('/api/federated/rounds', { body: { scenarios: s, dpNoiseMultiplier: dp } });
          setMsg(r.status === 'completed'
            ? { ok: true, text: `Round ${r.roundNo} completed. ${r.modelVersion} registered as a candidate — it needs review before deployment.` }
            : { ok: false, text: `Round ${r.roundNo} aborted: ${r.abortReason}. Logged; no model registered.` });
          router.refresh();
        } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
      }}><Play size={14} aria-hidden /> {busy ? 'Running…' : 'Run round'}</button>
    </section>
  );
}
