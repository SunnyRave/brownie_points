'use client';
import { motion } from 'motion/react';
import { IDEA_STATUSES, IDEA_STATUS_LABELS } from '@/lib/validation';

const RAIL = IDEA_STATUSES.filter((s) => s !== 'not_proceeding');

/** Animated progress along Proposed → Released; the current step pulses. "Not proceeding" is shown honestly. */
export function IdeaStatusRail({ status }: { status: string }) {
  if (status === 'not_proceeding') return <p className="mt-2 chip border-coral/40 text-coral">Not proceeding</p>;
  const idx = RAIL.indexOf(status as (typeof RAIL)[number]);
  return (
    <div className="mt-3" role="img" aria-label={`Status: ${IDEA_STATUS_LABELS[status as keyof typeof IDEA_STATUS_LABELS]}`}>
      <div className="relative h-1.5 rounded-full bg-surface-deep">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet to-teal" initial={{ width: 0 }} whileInView={{ width: `${(idx / (RAIL.length - 1)) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9 }} />
      </div>
      <ol className="mt-2 grid grid-cols-5 text-[11px]">
        {RAIL.map((s, i) => (
          <li key={s} className={`flex items-center gap-1 ${i <= idx ? 'text-ink' : 'text-muted'}`}>
            <span className={`relative h-2 w-2 rounded-full ${i <= idx ? 'bg-teal' : 'bg-line-2'}`}>{i === idx && <span className="ripple absolute inset-0 rounded-full bg-teal" />}</span>
            <span className="hidden sm:inline">{IDEA_STATUS_LABELS[s]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
