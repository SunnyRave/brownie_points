'use client';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Sparkles, X, Send } from 'lucide-react';

type Citation = { n: number; title: string; url: string; kind: string };

/** AIRA: streams an answer grounded only in sources the server permits for this caller. */
export function AiraPanel({ scopeLabel, suggestions }: { scopeLabel: string; suggestions: string[] }) {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  async function ask(question: string) {
    if (question.trim().length < 2) return;
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(true);
    setAnswer('');
    setCitations([]);
    try {
      const res = await fetch('/api/aira', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }), signal: abort.current.signal });
      if (!res.ok || !res.body) throw new Error();
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === 'text') setAnswer((a) => a + ev.text);
          if (ev.type === 'citations') setCitations(ev.citations);
        }
      }
    } catch {
      setAnswer((a) => a || 'AIRA is unavailable right now.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <p className="font-mono text-[11px] text-muted">Searching: {scopeLabel}</p>
      <div className="mt-3 min-h-[120px] flex-1 rounded-2xl bg-surface-deep p-4 text-sm leading-relaxed" aria-live="polite">
        {answer ? <span className={busy ? 'caret' : ''}>{answer}</span> : busy ? <span className="caret text-muted">Thinking</span> : <span className="text-muted">Ask about offerings, approved insights or themes. Answers cite approved sources only.</span>}
        <AnimatePresence>
          {citations.length > 0 && (
            <motion.ul initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-3 flex flex-wrap gap-2">
              {citations.map((c) => (
                <li key={c.n}><Link href={c.url} className="chip border-teal/40 text-teal hover:bg-teal/10">[{c.n}] {c.title}</Link></li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
      {!answer && !busy && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => <button key={s} className="chip whitespace-normal text-left hover:border-teal" onClick={() => { setQ(s); ask(s); }}>{s}</button>)}
        </div>
      )}
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <label htmlFor="aira-q" className="sr-only">Ask AIRA</label>
        <input id="aira-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask AIRA…" maxLength={500} />
        <button className="btn btn-primary" disabled={busy} aria-label="Ask"><Send size={16} aria-hidden /></button>
      </form>
    </div>
  );
}

export function AiraDock({ scopeLabel, suggestions }: { scopeLabel: string; suggestions: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-primary fixed bottom-5 right-5 z-50 shadow-[0_10px_40px_-10px_var(--accent)]" aria-haspopup="dialog">
        <Sparkles size={16} aria-hidden /> Ask AIRA
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-label="AIRA assistant" initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }} className="panel-solid fixed bottom-5 right-4 z-50 flex h-[min(560px,80vh)] w-[min(420px,calc(100vw-32px))] flex-col p-5 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-2 font-display text-lg font-semibold"><Sparkles size={18} className="text-accent" aria-hidden /> AIRA</p>
              <button onClick={() => setOpen(false)} className="btn btn-ghost btn-sm" aria-label="Close AIRA"><X size={16} aria-hidden /></button>
            </div>
            <AiraPanel scopeLabel={scopeLabel} suggestions={suggestions} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
