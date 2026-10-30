'use client';
import { motion, useReducedMotion } from 'motion/react';
import { Eye, ShieldCheck, Share2, Lightbulb, Undo2 } from 'lucide-react';

const STEPS = [
  { icon: Eye, title: 'Observe', body: 'Clients draft observations privately. Saving never shares.', color: 'var(--violet)' },
  { icon: ShieldCheck, title: 'Review', body: 'Moderators redact and generalise a separate shared copy.', color: 'var(--coral)' },
  { icon: Share2, title: 'Share', body: 'Only reviewed, de-identified copies reach the community.', color: 'var(--teal)' },
  { icon: Lightbulb, title: 'Improve', body: 'Themes across ≥3 organisations inform improvement ideas.', color: 'var(--amber)' },
  { icon: Undo2, title: 'Withdraw', body: 'Authors can withdraw; feed, search and AIRA clear in seconds.', color: 'var(--text-2)' },
];

export function LearningJourney() {
  const reduce = useReducedMotion();
  return (
    <div className="relative">
      <div className="absolute left-0 right-0 top-[42px] hidden h-px bg-line-2 md:block" aria-hidden>
        <motion.span className="packet absolute -top-[5px] h-[11px] w-[11px] rounded-full bg-teal shadow-[0_0_16px_var(--teal)]" animate={{ left: ['0%', '100%'] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }} />
      </div>
      <ol className="grid gap-4 md:grid-cols-5">
        {STEPS.map((s, i) => (
          <motion.li
            key={s.title}
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            whileHover={{ y: -6, rotate: i % 2 ? 1 : -1 }}
            className="panel-solid relative p-5"
          >
            <span className="relative z-10 grid h-[44px] w-[44px] place-items-center rounded-full border bg-surface-deep" style={{ borderColor: s.color }}>
              <s.icon size={18} style={{ color: s.color }} aria-hidden />
            </span>
            <p className="mt-4 font-mono text-xs text-muted">0{i + 1}</p>
            <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm text-ink-3">{s.body}</p>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
