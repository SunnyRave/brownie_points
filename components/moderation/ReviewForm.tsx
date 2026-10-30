'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api, errorText } from '@/lib/client';
import { TOPICS } from '@/lib/validation';
import type { SensitiveFlag } from '@/lib/db/schema';

type Item = {
  original: { title: string; body: string; region: string | null; topic: string | null; periodStart: string | null; periodEnd: string | null; industry: string | null; evidenceType: string | null; confidence: string; flags: SensitiveFlag[] };
  consent: { storeProcess: boolean; publishShared: boolean; attribution: boolean; trainingProgramme: boolean } | null;
  attributionOrg: string | null;
  suggestion: { title: string; body: string; regionGeneralised: string | null; periodQuarter: string | null; topic: string | null; themeId: string | null };
  currentShared: { status: string; version: number; title: string; body: string } | null;
  history: { decision: string; authorReason: string | null; internalNote: string | null; version: number; at: string }[];
  themes: { id: string; name: string }[];
};

function Highlighted({ text, flags }: { text: string; flags: SensitiveFlag[] }) {
  const sorted = [...flags].sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let i = 0;
  for (const f of sorted) {
    if (f.start < i) continue;
    out.push(text.slice(i, f.start));
    out.push(<mark key={f.start} title={f.kind} className="rounded bg-amber/30 px-0.5 text-ink">{text.slice(f.start, f.end)}</mark>);
    i = f.end;
  }
  out.push(text.slice(i));
  return <>{out}</>;
}

/** Word-level diff for the redaction preview. */
function diffWords(a: string, b: string) {
  const A = a.split(/(\s+)/);
  const B = b.split(/(\s+)/);
  const dp = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
  for (let x = A.length - 1; x >= 0; x--) for (let y = B.length - 1; y >= 0; y--) dp[x][y] = A[x] === B[y] ? dp[x + 1][y + 1] + 1 : Math.max(dp[x + 1][y], dp[x][y + 1]);
  const out: { t: string; k: 'same' | 'del' | 'add' }[] = [];
  let x = 0, y = 0;
  while (x < A.length && y < B.length) {
    if (A[x] === B[y]) { out.push({ t: A[x], k: 'same' }); x++; y++; } else if (dp[x + 1][y] >= dp[x][y + 1]) out.push({ t: A[x++], k: 'del' }); else out.push({ t: B[y++], k: 'add' });
  }
  while (x < A.length) out.push({ t: A[x++], k: 'del' });
  while (y < B.length) out.push({ t: B[y++], k: 'add' });
  return out;
}

/** MOD-02/03/06: original (read-only, flags highlighted) vs editable shared copy, redaction diff, reasoned decisions. */
export function ReviewForm({ id, item }: { id: string; item: Item }) {
  const router = useRouter();
  const [s, setS] = useState({ ...item.suggestion, showAttribution: false });
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<'duplicate' | 'unsafe' | 'out_of_scope'>('duplicate');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const diff = useMemo(() => diffWords(item.original.body, s.body), [item.original.body, s.body]);
  const o = item.original;

  async function decide(decision: 'return' | 'reject' | 'approve') {
    setBusy(true);
    setErr(null);
    try {
      const body =
        decision === 'approve'
          ? { decision, authorReason: reason || 'Approved with identifying details generalised.', internalNote: note || undefined, shared: { title: s.title, body: s.body, regionGeneralised: s.regionGeneralised || null, periodQuarter: s.periodQuarter || null, topic: s.topic || null, showAttribution: s.showAttribution, themeId: s.themeId || null } }
          : decision === 'reject' ? { decision, category, authorReason: reason, internalNote: note || undefined } : { decision, authorReason: reason, internalNote: note || undefined };
      await api(`/api/moderation/${id}`, { body });
      router.push('/moderate');
      router.refresh();
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel-solid p-6" aria-labelledby="orig-h">
          <h2 id="orig-h" className="font-semibold">Original (private source · read-only)</h2>
          {o.flags.length > 0 && <p className="mt-2 rounded-xl border border-amber/40 bg-amber/10 p-2 text-xs text-amber">{o.flags.length} automated flag(s): {[...new Set(o.flags.map((f) => f.kind.replace(/_/g, ' ')))].join(', ')}. The scan helps but can’t guarantee privacy — read carefully.</p>}
          <p className="mt-4 font-semibold"><Highlighted text={o.title} flags={o.flags.filter((f) => f.field === 'title')} /></p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-2"><Highlighted text={o.body} flags={o.flags.filter((f) => f.field === 'body')} /></p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            {[['Region', o.region], ['Period', `${o.periodStart ?? '?'} → ${o.periodEnd ?? '?'}`], ['Industry', o.industry], ['Topic', o.topic], ['Evidence', o.evidenceType], ['Confidence', o.confidence]].map(([k, v]) => <div key={k} className="panel-deep p-2"><dt className="text-muted">{k}</dt><dd>{v ?? '—'}</dd></div>)}
          </dl>
          <p className="mt-4 text-xs text-ink-3">Consents: store {item.consent?.storeProcess ? '✓' : '✗'} · publish {item.consent?.publishShared ? '✓' : '✗'} · attribution {item.consent?.attribution ? '✓' : '✗'} · training {item.consent?.trainingProgramme ? '✓' : '✗'}</p>
          {item.currentShared && <p className="mt-2 text-xs text-violet-text">A shared copy (v{item.currentShared.version}, {item.currentShared.status}) already exists and stays unchanged until you approve this version.</p>}
        </section>

        <section className="panel-glass p-6" aria-labelledby="shared-h">
          <h2 id="shared-h" className="font-semibold">Proposed shared copy (editable)</h2>
          <p className="mt-1 text-xs text-ink-3">Only these reviewed fields are published. No author, tenant, attachments or hidden metadata.</p>
          <div className="mt-4 space-y-3">
            <div><label className="label" htmlFor="s-title">Title</label><input id="s-title" className="input" value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} maxLength={140} /></div>
            <div><label className="label" htmlFor="s-body">Body</label><textarea id="s-body" className="textarea min-h-[160px]" value={s.body} onChange={(e) => setS({ ...s, body: e.target.value })} maxLength={4000} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label" htmlFor="s-region">Region (generalised)</label><input id="s-region" className="input" value={s.regionGeneralised ?? ''} onChange={(e) => setS({ ...s, regionGeneralised: e.target.value })} /></div>
              <div><label className="label" htmlFor="s-period">Period (quarter)</label><input id="s-period" className="input" value={s.periodQuarter ?? ''} onChange={(e) => setS({ ...s, periodQuarter: e.target.value })} /></div>
              <div><label className="label" htmlFor="s-topic">Topic</label><select id="s-topic" className="select" value={s.topic ?? ''} onChange={(e) => setS({ ...s, topic: e.target.value || null })}><option value="">—</option>{TOPICS.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><label className="label" htmlFor="s-theme">Theme {item.suggestion.themeId && <span className="text-teal">(suggested)</span>}</label><select id="s-theme" className="select" value={s.themeId ?? ''} onChange={(e) => setS({ ...s, themeId: e.target.value || null })}><option value="">No theme</option>{item.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            </div>
            <label className={`flex items-center gap-3 text-sm ${!item.consent?.attribution ? 'opacity-50' : ''}`}>
              <input type="checkbox" disabled={!item.consent?.attribution} checked={s.showAttribution} onChange={(e) => setS({ ...s, showAttribution: e.target.checked })} className="h-5 w-5 accent-[var(--coral)]" />
              Show organisation attribution {item.consent?.attribution ? `(${item.attributionOrg})` : '— author did not opt in'}
            </label>
          </div>
        </section>
      </div>

      <section className="panel-solid p-6">
        <h2 className="font-semibold">Redaction diff (body)</h2>
        <p className="mt-3 text-sm leading-relaxed">{diff.map((d, i) => d.k === 'same' ? <span key={i}>{d.t}</span> : d.k === 'del' ? <del key={i} className="bg-coral/20 text-coral">{d.t}</del> : <ins key={i} className="bg-teal/20 text-teal no-underline">{d.t}</ins>)}</p>
      </section>

      <section className="panel-solid grid gap-4 p-6 md:grid-cols-2">
        <div className="md:col-span-2"><label className="label" htmlFor="reason">Reason shown to the author (required)</label><textarea id="reason" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="e.g. Published with the customer name removed and the city generalised to region." /></div>
        <div className="md:col-span-2"><label className="label" htmlFor="note">Internal note (moderators only, never shared)</label><input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></div>
        <div className="flex flex-wrap items-end gap-3 md:col-span-2">
          <button className="btn btn-primary" disabled={busy} onClick={() => decide('approve')}>Approve & publish</button>
          <button className="btn btn-ghost" disabled={busy || reason.trim().length < 10} onClick={() => decide('return')}>Request clarification</button>
          <select aria-label="Reject category" className="select !w-auto" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}><option value="duplicate">Duplicate</option><option value="unsafe">Unsafe / confidential</option><option value="out_of_scope">Out of scope</option></select>
          <button className="btn btn-danger" disabled={busy || reason.trim().length < 10} onClick={() => decide('reject')}>Reject</button>
        </div>
        {err && <p className="error md:col-span-2" role="alert">{err}</p>}
      </section>

      {item.history.length > 0 && (
        <section className="panel-deep p-6">
          <h2 className="font-semibold">History</h2>
          <ul className="mt-3 space-y-2 text-sm">{item.history.map((h, i) => <li key={i}><span className="font-mono text-xs text-muted">v{h.version} · {h.decision} · {new Date(h.at).toLocaleString('en-GB')}</span><p className="text-ink-2">{h.authorReason}</p>{h.internalNote && <p className="text-xs text-coral">Internal: {h.internalNote}</p>}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
