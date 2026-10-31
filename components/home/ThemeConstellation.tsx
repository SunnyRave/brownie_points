'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { BellPlus, BellRing } from 'lucide-react';

export type ConstellationTheme = {
  id: string;
  name: string;
  summary: string;
  emerging: boolean;
  orgBand: string | null;
  offerings: string[];
  limitations: string;
  period: string | null;
  smallSample: boolean;
  updatedAt: string;
  evidence?: { id: string; title: string; region: string | null; period: string | null }[];
  ideas?: { id: string; title: string; status: string }[];
};

const POS = [[30, 38], [68, 30], [55, 70], [22, 74], [82, 66], [45, 18]];
const sizeFor = (t: ConstellationTheme) => (t.emerging ? 12 : t.orgBand === '10+' ? 30 : t.orgBand === '6–10' ? 24 : 19);

/** Themes as glowing nodes sized by distinct-org band; emerging themes are dim and dashed. */
export function ThemeConstellation({ themes, illustrative, subscribed }: { themes: ConstellationTheme[]; illustrative?: boolean; subscribed?: string[] }) {
  const [sel, setSel] = useState(themes.find((t) => !t.emerging)?.id ?? themes[0]?.id);
  const [subs, setSubs] = useState<string[] | undefined>(subscribed);
  const t = themes.find((x) => x.id === sel);
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="panel-glass relative aspect-[4/3] overflow-hidden">
        {illustrative && <span className="chip absolute left-4 top-4 z-10 border-amber/40 text-amber">Illustrative · synthetic</span>}
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" aria-hidden>
          {[...Array(30)].map((_, i) => <circle key={i} cx={(i * 37) % 100} cy={(i * 61) % 100} r=".25" fill="#fff" className="twinkle" style={{ animationDelay: `${i % 6}s` }} />)}
          {themes.slice(0, POS.length).map((th, i) => i > 0 && (
            <line key={th.id} x1={POS[0][0]} y1={POS[0][1]} x2={POS[i][0]} y2={POS[i][1]} stroke="var(--border-2)" strokeWidth=".2" />
          ))}
        </svg>
        <ul className="absolute inset-0">
          {themes.slice(0, POS.length).map((th, i) => {
            const s = sizeFor(th) * (sel === th.id ? 1.35 : 1);
            return (
              <li key={th.id} className="absolute" style={{ left: `${POS[i][0]}%`, top: `${POS[i][1]}%`, transform: 'translate(-50%,-50%)' }}>
                <button onClick={() => setSel(th.id)} aria-pressed={sel === th.id} className="group flex flex-col items-center gap-2" aria-label={`${th.name}${th.emerging ? ' (emerging)' : ` — ${th.orgBand} organisations`}`}>
                  <motion.span
                    animate={{ width: s * 2, height: s * 2 }}
                    className={`block rounded-full ${th.emerging ? 'border border-dashed border-ink-3/60 bg-ink-3/10' : 'bg-teal/30 shadow-[0_0_30px_var(--teal)]'}`}
                    style={{ boxShadow: th.emerging ? 'none' : undefined }}
                  />
                  <span className={`max-w-[140px] text-center text-xs ${th.emerging ? 'text-muted' : 'text-ink'}`}>{th.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <AnimatePresence mode="wait">
        {t && (
          <motion.div key={t.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="panel-glass p-6">
            <div className="flex flex-wrap items-center gap-2">
              {t.emerging ? <span className="chip">Emerging · gathering evidence</span> : <span className="chip border-teal/40 text-teal">{t.orgBand} contributing organisations</span>}
              {t.offerings.map((o) => <span key={o} className="chip">{o}</span>)}
            </div>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-2xl font-semibold">{t.name}</h3>
              {subs && <SubscribeButton themeId={t.id} on={subs.includes(t.id)} onChange={(on) => setSubs((s) => (on ? [...(s ?? []), t.id] : (s ?? []).filter((x) => x !== t.id)))} />}
            </div>
            <p className="mt-2 text-ink-2">{t.summary}</p>
            {!t.emerging && t.period && <p className="mt-3 font-mono text-xs text-ink-3">Observation period: {t.period}</p>}
            {(t.smallSample || t.emerging) && (
              <p role="note" className="mt-4 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
                {t.emerging ? 'Fewer than the minimum number of distinct organisations — counts and evidence breakdown are withheld.' : 'Small sample. This shows a recurring observation, not market prevalence or proof of cause.'}
              </p>
            )}
            <p className="mt-4 text-sm text-ink-3"><span className="text-ink-2">Limitations:</span> {t.limitations}</p>
            {!t.emerging && !!t.evidence?.length && (
              <div className="mt-5">
                <p className="text-sm font-semibold">Supporting approved contributions</p>
                <ul className="mt-2 space-y-2">
                  {t.evidence.map((e) => (
                    <li key={e.id} className="rounded-xl border border-violet/25 p-3 text-sm">
                      <p>{e.title}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted">{e.region ?? 'Region withheld'} · {e.period ?? '—'}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!!t.ideas?.length && (
              <div className="mt-5">
                <p className="text-sm font-semibold">Linked improvement ideas</p>
                <ul className="mt-2 flex flex-wrap gap-2">{t.ideas.map((i) => <li key={i.id} className="chip border-amber/40 text-amber">{i.title} · {i.status.replace('_', ' ')}</li>)}</ul>
              </div>
            )}
            {!illustrative && <p className="mt-4 font-mono text-[11px] text-muted">Last update {new Date(t.updatedAt).toLocaleDateString('en-GB')}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Theme subscription: in-app updates + a weekly digest that follows the same k-threshold rules as this dashboard. */
function SubscribeButton({ themeId, on, onChange }: { themeId: string; on: boolean; onChange: (on: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/themes/${themeId}/subscription`, { method: on ? 'DELETE' : 'POST', credentials: 'same-origin' });
      if (res.ok) onChange(!on);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" disabled={busy} aria-pressed={on} onClick={toggle} className={`btn btn-ghost btn-sm ${on ? '!border-teal !text-teal' : ''}`} title="Get in-app updates and a weekly digest. Counts are shown only as bands once enough organisations contribute.">
      {on ? <BellRing size={13} aria-hidden /> : <BellPlus size={13} aria-hidden />} {on ? 'Following' : 'Follow theme'}
    </button>
  );
}
