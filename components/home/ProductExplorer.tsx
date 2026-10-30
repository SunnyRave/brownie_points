'use client';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export type ExplorerProduct = { slug: string; name: string; family: string; label: string; tagline: string; summary: string; capabilities: string[]; steps: string[]; status: string };

/** Product families as tabs (auto-cycle every 6 s with a progress bar; any click stops autoplay). */
export function ProductExplorer({ products }: { products: ExplorerProduct[] }) {
  const families = [...new Set(products.map((p) => p.family))];
  const [fi, setFi] = useState(0);
  const [slug, setSlug] = useState(products.find((p) => p.family === families[0])?.slug);
  const [auto, setAuto] = useState(true);
  const reduce = useReducedMotion();
  const autoplay = auto && !reduce;
  useEffect(() => {
    if (!autoplay) return;
    const t = setTimeout(() => {
      const next = (fi + 1) % families.length;
      setFi(next);
      setSlug(products.find((p) => p.family === families[next])?.slug);
    }, 6000);
    return () => clearTimeout(t);
  }, [fi, autoplay, families, products]);
  const inFamily = products.filter((p) => p.family === families[fi]);
  const p = products.find((x) => x.slug === slug) ?? inFamily[0];
  if (!p) return null;
  return (
    <div className="panel-solid overflow-hidden p-2 md:p-3">
      <div role="tablist" aria-label="Product families" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {families.map((f, idx) => (
          <button
            key={f}
            role="tab"
            aria-selected={idx === fi}
            aria-controls="product-panel"
            onClick={() => { setFi(idx); setSlug(products.find((x) => x.family === f)?.slug); setAuto(false); }}
            className={`relative overflow-hidden rounded-2xl px-4 py-3 text-left transition-colors ${idx === fi ? 'bg-surface-deep text-ink' : 'text-ink-3 hover:text-ink'}`}
          >
            <span className="font-mono text-xs uppercase tracking-widest text-teal">{products.filter((x) => x.family === f).length} products</span>
            <span className="mt-1 block font-semibold">{f}</span>
            {idx === fi && autoplay && <motion.span key={`p${fi}`} className="absolute bottom-0 left-0 h-0.5 bg-teal" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 6, ease: 'linear' }} />}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 px-2 pt-2">
        {inFamily.map((x) => (
          <button key={x.slug} onClick={() => { setSlug(x.slug); setAuto(false); }} aria-pressed={x.slug === p.slug} className={`chip min-h-[36px] px-3 text-sm ${x.slug === p.slug ? 'border-teal text-ink' : ''}`}>{x.name}</button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div id="product-panel" role="tabpanel" key={p.slug} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }} className="grid gap-6 p-5 md:grid-cols-2 md:p-8">
          <div>
            <p className="eyebrow">{p.label}</p>
            <h3 className="mt-2 text-2xl font-semibold">{p.name}</h3>
            <p className="mt-1 font-display text-lg text-ink-2">{p.tagline}</p>
            <p className="mt-3 text-ink-2">{p.summary}</p>
            <ul className="mt-5 flex flex-wrap gap-2">{p.capabilities.map((c) => <li key={c} className="chip">{c}</li>)}</ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/products/${p.slug}`} className="btn btn-primary btn-sm">Explore {p.name}</Link>
              <Link href="/demo" className="btn btn-ghost btn-sm">Request demo</Link>
            </div>
          </div>
          <div className="panel-deep p-5">
            <div className="flex items-center justify-between"><p className="font-mono text-xs text-muted">HOW IT WORKS</p><span className="chip border-amber/40 text-amber">{p.status}</span></div>
            <ol className="mt-4 space-y-3">
              {p.steps.map((s, k) => (
                <motion.li key={s} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.09 }} className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-teal/50 font-mono text-xs text-teal">{k + 1}</span>
                  <span className="text-sm">{s}</span>
                </motion.li>
              ))}
            </ol>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
