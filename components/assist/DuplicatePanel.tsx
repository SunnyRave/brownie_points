import Link from 'next/link';
import { Copy } from 'lucide-react';
import { guarded } from '@/lib/page';
import { findPossibleDuplicates, type DuplicateMatch } from '@/lib/insights/assist';
import type { Principal } from '@/lib/policy/types';
import { MethodNote } from './MethodNote';

export function MatchRow({ m }: { m: DuplicateMatch }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <Link href={m.href} className="font-medium underline-offset-2 hover:underline">{m.title}</Link>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span className="chip">{m.kind === 'shared_insight' ? 'Published shared insight' : 'In moderation queue'}</span>
          {m.theme && <span className="chip">Theme: {m.theme.name}</span>}
          {m.sameOrganisation && <span className="chip border-amber/50 text-amber">Same contributing organisation — repeated post, not independent evidence</span>}
        </div>
        {m.matchedTerms.length > 0 && <p className="mt-1 text-xs text-ink-3">Shared terms: {m.matchedTerms.join(', ')}</p>}
      </div>
      <span className={m.strength === 'likely_duplicate' ? 'chip border-coral/50 text-coral' : 'chip'} title="Combined lexical score (0–1)">
        {m.strength === 'likely_duplicate' ? 'Likely duplicate' : 'Possibly related'} · {m.score.toFixed(2)}
      </span>
    </li>
  );
}

/** Moderator review page: possible duplicates of the item under review. The service enforces the moderator grant. */
export async function DuplicatePanel({ principal, id }: { principal: Principal; id: string }) {
  const r = await guarded(() => findPossibleDuplicates(principal, id));
  if (!r.ok) return null;
  const { matches, method, thresholds, note } = r.data;
  return (
    <section aria-labelledby="dups-h" className="panel-solid mb-6 p-5 md:p-6">
      <h2 id="dups-h" className="flex items-center gap-2 text-lg font-semibold"><Copy size={16} aria-hidden /> Possible duplicates</h2>
      {matches.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">No published shared insight or queued item shares enough wording with this contribution (score ≥ {thresholds.possible}).</p>
      ) : (
        <ul className="mt-2 divide-y divide-line-2">{matches.map((m) => <MatchRow key={`${m.kind}:${m.id}`} m={m} />)}</ul>
      )}
      <div className="mt-3"><MethodNote>{method}. {note} Compared only with published shared copies and items in the moderation queue — never drafts, private or organisation-only records.</MethodNote></div>
    </section>
  );
}
