import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { EmptyState, PageHeader, StatePill, fmtDateTime } from '@/components/ui';
import { requirePrincipal } from '@/lib/page';
import { listQueue } from '@/lib/services/moderation';
import { STATE_LABELS, type ObservationState } from '@/lib/learning/stateMachine';

export default async function Queue() {
  const p = await requirePrincipal();
  const items = await listQueue(p);
  return (
    <>
      <PageHeader eyebrow="Moderation" title="Review queue" description="Only contributions proposed for community sharing appear here. Drafts, private and organisation-only records are never visible to moderators." />
      {items.length === 0 ? <EmptyState title="Queue is clear" body="New proposals will appear here." /> : (
        <ul className="grid gap-3">
          {items.map((i) => (
            <li key={i.id}>
              <Link href={`/moderate/${i.id}`} className="panel-solid flex flex-wrap items-center justify-between gap-3 p-5 transition-transform hover:-translate-y-0.5">
                <div>
                  <div className="flex flex-wrap gap-2"><StatePill state={i.state} label={STATE_LABELS[i.state as ObservationState]} />{i.version > 1 && <span className="chip">v{i.version} · re-review</span>}{i.topic && <span className="chip">{i.topic}</span>}</div>
                  <p className="mt-2 font-semibold">{i.title}</p>
                </div>
                <div className="flex items-center gap-3">
                  {i.flagCount > 0 && <span className="chip border-amber/50 text-amber"><AlertTriangle size={12} aria-hidden /> {i.flagCount} flag{i.flagCount > 1 ? 's' : ''}</span>}
                  <span className="font-mono text-xs text-muted">{fmtDateTime(i.updatedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
