'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Lock, Play } from 'lucide-react';
import { api, errorText } from '@/lib/client';
import { SimulatedRibbon } from '@/components/ui';
import type { Scenario } from '@/lib/services/playground';

type Offering = { id: string; slug: string; name: string; enabled: boolean };
type Result = { runId: string; outputs: { label: string; signal: string; metrics: { name: string; value: string | number }[]; evidence: string[] } };

/** Guided flow: offering → scenario → inputs → run → evidence → structured feedback (EMP-02/03, CLI-03). */
export function Playground({ context, offerings, scenarios }: { context: 'employee' | 'client'; offerings: Offering[]; scenarios: Scenario[] }) {
  const firstEnabled = offerings.find((o) => o.enabled && scenarios.some((s) => s.offeringSlug === o.slug));
  const [offering, setOffering] = useState(firstEnabled?.slug ?? '');
  const list = scenarios.filter((s) => s.offeringSlug === offering);
  const [scenarioId, setScenarioId] = useState(list[0]?.id ?? '');
  const scenario = scenarios.find((s) => s.id === scenarioId);
  const [inputs, setInputs] = useState<Record<string, number>>(scenario?.inputs ?? {});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fb, setFb] = useState<'idle' | 'sent'>('idle');

  const pickScenario = (id: string) => {
    const s = scenarios.find((x) => x.id === id);
    setScenarioId(id);
    setInputs(s?.inputs ?? {});
    setResult(null);
    setFb('idle');
  };

  return (
    <div className="space-y-6">
      <SimulatedRibbon />
      <section className="panel-solid p-5">
        <h2 className="font-semibold">1 · Choose an offering</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {offerings.map((o) => {
            const has = scenarios.some((s) => s.offeringSlug === o.slug);
            const usable = o.enabled && has;
            return (
              <button key={o.id} disabled={!usable} onClick={() => { setOffering(o.slug); const s = scenarios.find((x) => x.offeringSlug === o.slug); if (s) pickScenario(s.id); }} className={`chip min-h-[40px] px-4 text-sm ${offering === o.slug ? 'border-accent text-ink' : ''} ${!usable ? 'opacity-50' : ''}`} title={!o.enabled ? 'Not entitled for your organisation' : !has ? 'No scenarios yet' : ''}>
                {!o.enabled && <Lock size={12} aria-hidden />} {o.name}
              </button>
            );
          })}
        </div>
        {!firstEnabled && <p className="mt-3 text-sm text-ink-3">No sandbox is enabled for this workspace yet.</p>}
      </section>

      {scenario && (
        <section className="panel-solid p-5">
          <h2 className="font-semibold">2 · Pick a synthetic scenario</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {list.map((s) => (
              <button key={s.id} onClick={() => pickScenario(s.id)} className={`rounded-2xl border p-4 text-left transition-colors ${s.id === scenarioId ? 'border-accent bg-surface-deep' : 'border-line hover:border-line-2'}`}>
                <p className="font-semibold">{s.name}</p>
                <p className="mt-1 text-xs text-ink-3">{s.description}</p>
              </button>
            ))}
          </div>
          <h2 className="mt-6 font-semibold">3 · Inspect inputs <span className="font-mono text-xs text-amber">(sample data)</span></h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {scenario.fields.map((f) => (
              <div key={f.key}>
                <label className="label" htmlFor={`in-${f.key}`}>{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
                <input id={`in-${f.key}`} type="number" className="input font-mono" min={f.min} max={f.max} step={f.step} value={inputs[f.key] ?? ''} onChange={(e) => setInputs({ ...inputs, [f.key]: Number(e.target.value) })} />
              </div>
            ))}
          </div>
          <button className="btn btn-primary mt-5" disabled={busy} onClick={async () => {
            setBusy(true); setErr(null); setFb('idle');
            try { setResult(await api<Result>('/api/playground/run', { body: { context, scenarioId, inputs } })); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
          }}><Play size={16} aria-hidden /> {busy ? 'Running…' : 'Run deterministic demo'}</button>
          {err && <p className="error" role="alert">{err}</p>}
        </section>
      )}

      <AnimatePresence>
        {result && (
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="panel-sim p-5" aria-live="polite">
            <p className="font-mono text-xs text-amber">{result.outputs.label}</p>
            <h2 className="mt-2 text-xl font-semibold">4 · Simulated signal: {result.outputs.signal}</h2>
            <p className="text-xs text-ink-3">An illustrative signal for discussion. It is not an approved credit or business decision.</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
              {result.outputs.metrics.map((m) => (
                <div key={m.name} className="panel-deep p-3"><dt className="text-[11px] text-muted">{m.name}</dt><dd className="font-mono text-lg">{m.value}</dd></div>
              ))}
            </dl>
            <h3 className="mt-5 font-semibold">Evidence</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">{result.outputs.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
            <h3 className="mt-5 font-semibold">5 · Structured feedback</h3>
            {fb === 'sent' ? <p className="mt-2 text-sm text-teal" role="status">Thanks — feedback saved with this run.</p> : (
              <form className="mt-2 grid gap-3 md:grid-cols-3" onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try { await api(`/api/playground/runs/${result.runId}/feedback`, { body: { useful: f.get('useful'), clarity: Number(f.get('clarity')), comment: String(f.get('comment') ?? '') || undefined } }); setFb('sent'); } catch (x) { setErr(errorText(x)); }
              }}>
                <div><label className="label" htmlFor="useful">Was this useful?</label><select id="useful" name="useful" className="select"><option value="yes">Yes</option><option value="partly">Partly</option><option value="no">No</option></select></div>
                <div><label className="label" htmlFor="clarity">Clarity (1–5)</label><select id="clarity" name="clarity" className="select" defaultValue="4">{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></div>
                <div><label className="label" htmlFor="comment">Comment</label><input id="comment" name="comment" className="input" maxLength={1000} /></div>
                <button className="btn btn-ghost btn-sm w-fit">Send feedback</button>
              </form>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
