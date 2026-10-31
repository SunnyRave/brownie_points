import { Headset, User } from 'lucide-react';
import { cx, fmtDateTime } from '@/components/ui';
import { FLAG_LABELS, STATUS_LABELS, STATUS_TONE, type TicketStatus } from './labels';

export type ThreadMessage = { id: string; authorSide: 'client' | 'azentio'; authorName: string; body: string; flags: string[]; mine: boolean; createdAt: string };

export function TicketStatusPill({ status }: { status: string }) {
  return <span className={cx('chip', STATUS_TONE[status as TicketStatus])}>{STATUS_LABELS[status as TicketStatus] ?? status}</span>;
}

/** Presentational ticket thread. `viewer` decides which side is drawn as "you". */
export function TicketThread({ messages, viewer }: { messages: ThreadMessage[]; viewer: 'client' | 'azentio' }) {
  return (
    <ol className="space-y-4" aria-label="Ticket conversation">
      {messages.map((m) => {
        const azentio = m.authorSide === 'azentio';
        const ours = m.authorSide === viewer;
        return (
          <li key={m.id} className={cx('flex', ours ? 'justify-end' : 'justify-start')}>
            <article className={cx('max-w-[85%] rounded-2xl border p-4 text-sm', azentio ? 'border-accent/30 bg-accent/5' : 'border-line bg-surface-deep')}>
              <header className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                {azentio ? <Headset size={13} aria-hidden /> : <User size={13} aria-hidden />}
                <span className="font-medium text-ink-2">{m.authorName}</span>
                <span>· {azentio ? 'Azentio support' : 'Client'}</span>
                <span className="font-mono">· {fmtDateTime(m.createdAt)}</span>
              </header>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed text-ink-2">{m.body}</p>
              {m.flags.length > 0 && (
                <p className="mt-2 text-xs text-amber">Flagged: possible {[...new Set(m.flags)].map((f) => FLAG_LABELS[f] ?? f).join(', ')}</p>
              )}
            </article>
          </li>
        );
      })}
    </ol>
  );
}
