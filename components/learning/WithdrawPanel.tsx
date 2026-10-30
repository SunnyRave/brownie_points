'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { api, errorText } from '@/lib/client';

type Receipt = { sharedInsightId: string | null; steps: { step: string; ms: number }[]; totalMs: number };
type Pane = 'feed' | 'search' | 'aira';

/** SHR-05/06: withdraw, then independently verify feed, search and AIRA no longer return the item — with a live timer. */
export function WithdrawPanel({ id, title, sharedId }: { id: string; title: string; sharedId: string | null }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [cleared, setCleared] = useState<Partial<Record<Pane, number>>>({});
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const t0 = useRef(0);

  useEffect(() => {
    if (!receipt?.sharedInsightId) return;
    const sid = receipt.sharedInsightId;
    let stop = false;
    const tick = setInterval(() => setElapsed((performance.now() - t0.current) / 1000), 100);
    const check = async () => {
      const done: Partial<Record<Pane, number>> = {};
      const feed = await api<{ results: { id: string }[] }>('/api/community');
      if (!feed.results.some((r) => r.id === sid)) done.feed = (performance.now() - t0.current) / 1000;
      const s = await api<{ results: { url: string }[] }>(`/api/search?q=${encodeURIComponent(title)}`);
      if (!s.results.some((r) => r.url.endsWith(sid))) done.search = (performance.now() - t0.current) / 1000;
      const res = await fetch('/api/aira', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: title }) });
      const text = await res.text();
      if (!text.includes(sid)) done.aira = (performance.now() - t0.current) / 1000;
      setCleared((c) => ({ ...done, ...c }));
      if (!stop && Object.keys(done).length < 3 && performance.now() - t0.current < 60_000) setTimeout(check, 1500);
    };
    check();
    return () => { stop = true; clearInterval(tick); };
  }, [receipt, title]);

  const allClear = receipt && (!receipt.sharedInsightId || (cleared.feed !== undefined && cleared.search !== undefined && cleared.aira !== undefined));

  if (receipt)
    return (
      <section className="panel-solid p-5" aria-live="polite">
        <h2 className="font-semibold">Withdrawn</h2>
        <p className="mt-1 font-mono text-xs text-muted">Committed in one transaction · {receipt.totalMs} ms server-side</p>
        {receipt.sharedInsightId ? (
          <>
            <p className="mt-4 font-mono text-3xl text-teal">{(allClear ? Math.max(...Object.values(cleared)) : elapsed).toFixed(1)}s</p>
            <ul className="mt-3 space-y-2">
              {(['feed', 'search', 'aira'] as Pane[]).map((p) => (
                <AnimatePresence key={p}>
                  <motion.li layout className={`flex items-center justify-between rounded-xl border p-3 text-sm ${cleared[p] !== undefined ? 'border-teal/40' : 'border-line'}`}>
                    <span>{p === 'feed' ? 'Shared feed & counts' : p === 'search' ? 'Search index' : 'AIRA retrieval'}</span>
                    {cleared[p] !== undefined ? <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-1 text-teal"><CheckCircle2 size={16} aria-hidden /> cleared {cleared[p]!.toFixed(1)}s</motion.span> : <Loader2 size={16} className="animate-spin text-muted" aria-label="checking" />}
                  </motion.li>
                </AnimatePresence>
              ))}
            </ul>
          </>
        ) : <p className="mt-3 text-sm text-ink-2">This submission had no shared copy; it’s removed from review.</p>}
        <p className="mt-4 text-xs text-ink-3">Already viewed or copied material cannot be recalled automatically. Production propagation SLA: 5 minutes across all replicas.</p>
        {allClear && <button className="btn btn-ghost btn-sm mt-4" onClick={() => router.refresh()}>Refresh record</button>}
      </section>
    );

  return (
    <section className="panel-solid p-5">
      <h2 className="font-semibold">Withdraw</h2>
      <p className="mt-1 text-sm text-ink-3">{sharedId ? 'Removes the shared version from the community feed, counts, search and AIRA.' : 'Stops sharing this contribution.'}</p>
      {!confirm ? <button className="btn btn-danger mt-4 w-full" onClick={() => setConfirm(true)}>Withdraw…</button> : (
        <div className="mt-4 space-y-3">
          <p className="rounded-xl border border-coral/40 bg-coral/10 p-3 text-sm text-coral">Withdrawal stops future visibility and AI retrieval. Material already viewed or copied by others cannot be recalled.</p>
          <div className="flex gap-2">
            <button className="btn btn-danger flex-1" onClick={async () => {
              setErr(null);
              t0.current = performance.now();
              try { setReceipt(await api<Receipt>(`/api/observations/${id}/withdraw`, { method: 'POST', body: {} })); } catch (e) { setErr(errorText(e)); }
            }}>Confirm withdrawal</button>
            <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}
      {err && <p className="error" role="alert">{err}</p>}
    </section>
  );
}
