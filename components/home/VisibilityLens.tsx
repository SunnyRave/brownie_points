'use client';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Globe, Lock, Users } from 'lucide-react';

export type LensValue = 'private' | 'org' | 'propose_shared';
const OPTIONS: { value: LensValue; label: string; icon: typeof Lock; who: string; rings: number }[] = [
  { value: 'private', label: 'Private', icon: Lock, who: 'Only you can see this draft.', rings: 1 },
  { value: 'org', label: 'Organisation', icon: Users, who: 'You and members of your organisation. Never enters the community.', rings: 2 },
  { value: 'propose_shared', label: 'Community', icon: Globe, who: 'Your organisation + moderators review. Only a reviewed, de-identified copy is shared with approved participants.', rings: 3 },
];

/** Concentric audience rings + a preview card that morphs from solid (private) to glass (shared). */
export function VisibilityLens({ value, onChange, compact }: { value?: LensValue; onChange?: (v: LensValue) => void; compact?: boolean }) {
  const [local, setLocal] = useState<LensValue>('private');
  const v = value ?? local;
  const set = (x: LensValue) => (onChange ? onChange(x) : setLocal(x));
  const opt = OPTIONS.find((o) => o.value === v)!;
  return (
    <div className={`grid items-center gap-6 ${compact ? '' : 'md:grid-cols-2'}`}>
      <div className="min-w-0">
        <div role="radiogroup" aria-label="Who can see this" className="inline-flex max-w-full rounded-full border border-line-2 bg-surface-deep p-1">
          {OPTIONS.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={v === o.value} onClick={() => set(o.value)} className="relative min-h-[40px] rounded-full px-3 text-sm sm:px-4">
              {v === o.value && <motion.span layoutId={compact ? 'lens-pill-c' : 'lens-pill'} className="absolute inset-0 rounded-full bg-violet/30" />}
              <span className="relative flex items-center gap-1.5"><o.icon size={14} aria-hidden className="hidden sm:block" /> {o.label}</span>
            </button>
          ))}
        </div>
        <motion.div layout className={`mt-5 p-5 transition-colors ${v === 'propose_shared' ? 'panel-glass' : 'panel-solid'}`}>
          <p className="font-mono text-xs text-muted">WHO CAN SEE THIS</p>
          <p className="mt-2 text-ink" aria-live="polite">{opt.who}</p>
          {v === 'propose_shared' && <p className="mt-3 text-xs text-violet-text">Requires your explicit consent and moderator review. Attribution is opt-in.</p>}
        </motion.div>
      </div>
      {!compact && (
        <div className="relative mx-auto aspect-square w-full max-w-[min(320px,100%)]" aria-hidden>
          {[3, 2, 1].map((r) => (
            <motion.div
              key={r}
              className={`absolute rounded-full border ${r === 3 ? 'border-violet/60' : r === 2 ? 'border-violet/40' : 'border-teal/60'}`}
              style={{ inset: `${(3 - r) * 16}%` }}
              animate={{ opacity: r <= opt.rings ? 1 : 0.08, scale: r <= opt.rings ? 1 : 0.94 }}
              transition={{ duration: 0.5 }}
            >
              {r === 3 && opt.rings === 3 && (
                <>
                  <span className="ripple absolute inset-0 rounded-full border border-violet/40" />
                  <span className="spin-slow absolute inset-0">
                    <span className="absolute -top-1 left-1/2 h-2 w-2 rounded-full bg-violet-text" />
                    <span className="absolute -bottom-1 left-1/3 h-2 w-2 rounded-full bg-teal" />
                  </span>
                </>
              )}
            </motion.div>
          ))}
          <div className="absolute inset-[42%] grid place-items-center rounded-full bg-teal/20"><opt.icon className="text-teal" size={22} /></div>
          <span className="absolute left-1/2 top-[34%] -translate-x-1/2 font-mono text-[10px] text-ink-3">YOU</span>
          <span className="absolute left-1/2 top-[18%] -translate-x-1/2 font-mono text-[10px] text-ink-3">ORG</span>
          <span className="absolute left-1/2 top-[2%] -translate-x-1/2 font-mono text-[10px] text-ink-3">COMMUNITY</span>
        </div>
      )}
    </div>
  );
}
