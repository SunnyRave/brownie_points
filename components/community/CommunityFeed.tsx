'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { Flag, Globe } from 'lucide-react';
import { api, errorText } from '@/lib/client';

type Item = { id: string; title: string; body: string; region: string | null; period: string | null; topic: string | null; industry: string | null; confidence: string | null; attribution: string | null; type: string; publishedAt: string; version: number };
type Facet = { key: string; label: string; options: { value: string; label: string; disabled: boolean; reason?: string }[] };
type Feed = { results: Item[]; count: number; facets: Facet[]; applied: Record<string, string>; rejected: string[]; k: number };

/** CLI-05 + INS-03: filters whose slice (or complement) would fall below k are disabled — and refused server-side. */
export function CommunityFeed({ focus }: { focus?: string }) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [feed, setFeed] = useState<Feed | null>(null);
  const [q, setQ] = useState('');
  const load = useCallback(async (f: Record<string, string>) => {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    setFeed(await api<Feed>(`/api/community?${qs}`));
  }, []);
  useEffect(() => { load(filters); }, [filters, load]);
  const visible = feed?.results.filter((r) => !q || `${r.title} ${r.body}`.toLowerCase().includes(q.toLowerCase())) ?? [];

  return (
    <section aria-labelledby="feed-h">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="feed-h" className="text-xl font-semibold">Approved shared feed</h2>
        <p className="font-mono text-xs text-muted" aria-live="polite">{visible.length} result{visible.length === 1 ? '' : 's'}</p>
      </div>
      <div className="panel-glass mt-4 grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="md:col-span-3 xl:col-span-1">
          <label htmlFor="feed-q" className="label">Search feed</label>
          <input id="feed-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Keyword" />
        </div>
        {feed?.facets.map((f) => (
          <div key={f.key}>
            <label htmlFor={`f-${f.key}`} className="label">{f.label}</label>
            <select id={`f-${f.key}`} className="select" value={filters[f.key] ?? ''} onChange={(e) => setFilters({ ...filters, [f.key]: e.target.value })}>
              <option value="">All</option>
              {f.options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled && filters[f.key] !== o.value}>{o.label}{o.disabled ? ` — hidden (<${feed.k} orgs)` : ''}</option>)}
            </select>
          </div>
        ))}
      </div>
      {feed && feed.rejected.length > 0 && <p role="status" className="mt-3 text-sm text-amber">Some filters were not applied because they would narrow results below {feed.k} organisations.</p>}
      <ul className="mt-5 grid gap-4 md:grid-cols-2">
        <AnimatePresence>
          {visible.map((r) => (
            <motion.li key={r.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} id={`item-${r.id}`} className={`panel-glass p-5 ${focus === r.id ? 'ring-2 ring-violet' : ''}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="chip border-violet/40 text-violet-text"><Globe size={11} aria-hidden /> Shared community</span>
                {r.topic && <span className="chip">{r.topic}</span>}
                {r.confidence && <span className="chip">confidence: {r.confidence}</span>}
              </div>
              <h3 className="mt-3 font-semibold">{r.title}</h3>
              <p className="mt-2 text-sm text-ink-2">{r.body}</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[11px] text-muted">{[r.industry, r.region, r.period].filter(Boolean).join(' · ')}{r.attribution ? ` · ${r.attribution}` : ' · de-identified'}</p>
                <ReportButton id={r.id} onDone={() => load(filters)} />
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {feed && visible.length === 0 && <p className="mt-6 text-sm text-ink-3">No approved contributions match.</p>}
    </section>
  );
}

function ReportButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (msg) return <span className="text-xs text-teal" role="status">{msg}</span>;
  if (!open) return <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}><Flag size={13} aria-hidden /> Report</button>;
  return (
    <form className="flex w-full flex-wrap gap-2" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      try { await api(`/api/community/${id}/report`, { body: { reason: f.get('reason'), details: String(f.get('details') ?? '') || undefined } }); setMsg('Reported to moderators. Thank you.'); onDone(); } catch (x) { setMsg(errorText(x)); }
    }}>
      <label className="sr-only" htmlFor={`r-${id}`}>Reason</label>
      <select id={`r-${id}`} name="reason" className="select !min-h-9 !w-auto !py-1 text-sm"><option value="misleading">Misleading</option><option value="confidential">Confidential</option><option value="inappropriate">Inappropriate</option><option value="other">Other</option></select>
      <input name="details" className="input !min-h-9 flex-1 !py-1 text-sm" placeholder="Details (optional, no client names needed)" maxLength={1000} />
      <button className="btn btn-danger btn-sm">Send</button>
    </form>
  );
}
