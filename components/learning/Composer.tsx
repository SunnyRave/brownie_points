'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { api, errorText } from '@/lib/client';
import { scanSensitive } from '@/lib/scan';
import { VisibilityLens, type LensValue } from '@/components/home/VisibilityLens';
import { EVIDENCE_TYPES, INDUSTRIES, OBSERVATION_TYPES, OBSERVATION_TYPE_LABELS, REGIONS, TOPICS, observationDraftSchema, type ObservationDraftInput } from '@/lib/validation';

type Initial = Partial<ObservationDraftInput> & { id?: string; state?: string };

/** OBS-01/02/05/08: structured form, shared Zod schema, inline guidance, live "who can see this". */
export function Composer({ base, offerings, initial }: { base: string; offerings: { id: string; name: string }[]; initial?: Initial }) {
  const router = useRouter();
  const [v, setV] = useState<Initial>({ type: 'market_observation', confidence: 'medium', ...initial });
  const [intent, setIntent] = useState<LensValue>('private');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const flags = useMemo(() => scanSensitive({ title: v.title ?? '', body: v.body ?? '' }), [v.title, v.body]);
  const editingPublished = initial?.state === 'published';
  const set = (k: keyof ObservationDraftInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value || null });

  async function save(goShare: boolean) {
    const parsed = observationDraftSchema.safeParse(v);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    setErr(null);
    try {
      const r = initial?.id
        ? await api<{ id: string }>(`/api/observations/${initial.id}`, { method: 'PATCH', body: parsed.data })
        : await api<{ id: string }>('/api/observations', { body: parsed.data });
      router.push(`${base}/observations/${r.id}${goShare ? `?share=${intent}#share` : ''}`);
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  }

  const sel = (k: keyof ObservationDraftInput, label: string, options: readonly string[], labels?: Record<string, string>, optional = true) => (
    <div>
      <label className="label" htmlFor={k}>{label}</label>
      <select id={k} className="select" value={(v[k] as string) ?? ''} onChange={set(k)}>
        {optional && <option value="">—</option>}
        {options.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
      </select>
      {errors[k] && <p className="error">{errors[k]}</p>}
    </div>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <form className="panel-solid grid gap-5 p-6 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(false); }} noValidate>
        {sel('type', 'Type', OBSERVATION_TYPES, OBSERVATION_TYPE_LABELS, false)}
        <div>
          <label className="label" htmlFor="offeringId">Offering</label>
          <select id="offeringId" className="select" value={v.offeringId ?? ''} onChange={set('offeringId')}><option value="">—</option>{offerings.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </div>
        {sel('industry', 'Industry', INDUSTRIES)}
        <div>
          <label className="label" htmlFor="region">Region</label>
          <input id="region" list="regions" className="input" value={v.region ?? ''} onChange={set('region')} maxLength={80} />
          <datalist id="regions">{REGIONS.map((r) => <option key={r} value={r} />)}</datalist>
          <p className="hint">Prefer a broad region; moderators generalise cities.</p>
        </div>
        {sel('topic', 'Topic', TOPICS)}
        {sel('evidenceType', 'Evidence type', EVIDENCE_TYPES)}
        <div><label className="label" htmlFor="periodStart">Observation period — from</label><input id="periodStart" type="date" className="input" value={v.periodStart ?? ''} onChange={set('periodStart')} /></div>
        <div><label className="label" htmlFor="periodEnd">to</label><input id="periodEnd" type="date" className="input" value={v.periodEnd ?? ''} onChange={set('periodEnd')} />{errors.periodEnd && <p className="error">{errors.periodEnd}</p>}</div>
        {sel('confidence', 'Confidence', ['low', 'medium', 'high'], { low: 'Low', medium: 'Medium', high: 'High' }, false)}
        <div className="md:col-span-2">
          <label className="label" htmlFor="title">Title</label>
          <input id="title" className="input" value={v.title ?? ''} onChange={set('title')} maxLength={140} aria-invalid={!!errors.title} />
          <p className="hint">{(v.title ?? '').length}/140</p>
          {errors.title && <p className="error">{errors.title}</p>}
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="body">What did you observe?</label>
          <textarea id="body" className="textarea min-h-[180px]" value={v.body ?? ''} onChange={set('body')} maxLength={4000} aria-invalid={!!errors.body} aria-describedby="body-guidance" />
          <p className="hint">{(v.body ?? '').length}/4000</p>
          {errors.body && <p className="error">{errors.body}</p>}
        </div>
        {err && <p className="error md:col-span-2" role="alert">{err}</p>}
        <div className="flex flex-wrap gap-3 md:col-span-2">
          <button className="btn btn-primary" disabled={busy}><Lock size={16} aria-hidden /> {editingPublished ? 'Save as new version (re-review)' : initial?.id ? 'Save changes' : 'Save private draft'}</button>
          {!initial?.id && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => save(true)}>Save & choose sharing…</button>}
        </div>
        {editingPublished && <p className="hint md:col-span-2">Material edits create a new version that needs moderator review. The current shared copy stays as-is until approved; its audience never widens silently.</p>}
      </form>

      <aside className="space-y-5">
        <div className="panel-solid p-5">
          <p className="font-semibold">Who can see this</p>
          <p className="mt-1 text-sm text-ink-2"><Lock size={13} className="mr-1 inline text-teal" aria-hidden />Right now: <strong>only you</strong>. Saving keeps it a private draft.</p>
          <p className="mt-3 text-xs text-ink-3">Preview the sharing choice you’ll make when submitting:</p>
          <div className="mt-3"><VisibilityLens value={intent} onChange={setIntent} compact /></div>
        </div>
        <div id="body-guidance" className="panel-deep p-5 text-sm">
          <p className="font-semibold">Please don’t include</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-3">
            <li>Customer identities or names</li>
            <li>Account, card or IBAN numbers</li>
            <li>Transaction-level data</li>
            <li>Credentials or secrets</li>
            <li>Confidential pricing or contract terms</li>
          </ul>
          <div className={`mt-4 rounded-xl border p-3 ${flags.length ? 'border-amber/50 bg-amber/10 text-amber' : 'border-line text-ink-3'}`} aria-live="polite">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={14} aria-hidden /> {flags.length ? `${flags.length} possible sensitive item${flags.length > 1 ? 's' : ''}` : 'No obvious sensitive patterns'}</p>
            {flags.length > 0 && <ul className="mt-2 space-y-1 font-mono text-xs">{flags.slice(0, 6).map((f, i) => <li key={i}>{f.kind.replace(/_/g, ' ')}: “{f.match}”</li>)}</ul>}
            <p className="mt-2 text-xs">This check helps, but it can’t guarantee privacy.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
