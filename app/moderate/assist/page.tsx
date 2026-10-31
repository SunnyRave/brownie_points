import Link from 'next/link';
import { Layers } from 'lucide-react';
import { Denied, EmptyState, PageHeader, StatePill } from '@/components/ui';
import { MatchRow } from '@/components/assist/DuplicatePanel';
import { MethodNote } from '@/components/assist/MethodNote';
import { requirePrincipal, guarded } from '@/lib/page';
import { queueDuplicateOverview, suggestClusters, type ClusterSuggestion } from '@/lib/insights/assist';
import { STATE_LABELS, type ObservationState } from '@/lib/learning/stateMachine';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<ClusterSuggestion['status'], string> = {
  candidate_new_theme: 'chip border-teal/50 text-teal',
  existing_theme: 'chip border-violet/40 text-violet-text',
  emerging: 'chip border-amber/50 text-amber',
};
const STATUS_LABEL: Record<ClusterSuggestion['status'], string> = {
  candidate_new_theme: 'Candidate new theme',
  existing_theme: 'Existing theme',
  emerging: 'Emerging — do not publish counts',
};

export default async function AssistPage() {
  const p = await requirePrincipal('/moderate/assist');
  const r = await guarded(() => Promise.all([queueDuplicateOverview(p), suggestClusters(p)]));
  if (!r.ok) return <Denied status={r.status} />;
  const [queue, clusters] = r.data;
  return (
    <>
      <PageHeader
        eyebrow="Moderation assist"
        title="Duplicates & clusters"
        description="Suggestions to help reviewers spot repeated submissions and recurring topics. Nothing here changes a record — a moderator decides."
      />
      <MethodNote>{queue.method}. Swapping in semantic embeddings (pgvector) is the production path, with the same audience filter applied before similarity: only published shared copies and the moderator-visible queue are ever compared — never drafts, private or organisation-only records.</MethodNote>

      <section aria-labelledby="queue-dups-h" className="mt-8">
        <h2 id="queue-dups-h" className="mb-3 text-xl font-semibold">Queue items and their closest match</h2>
        {queue.items.length === 0 ? <EmptyState title="Queue is clear" /> : (
          <ul className="grid gap-3">
            {queue.items.map((i) => (
              <li key={i.id} className="panel-solid p-5">
                <div className="flex flex-wrap items-center gap-2"><StatePill state={i.state} label={STATE_LABELS[i.state as ObservationState] ?? i.state} />{i.topic && <span className="chip">{i.topic}</span>}</div>
                <Link href={`/moderate/${i.id}`} className="mt-2 block font-semibold underline-offset-2 hover:underline">{i.title}</Link>
                {i.top ? <ul className="mt-1 border-t border-line-2"><MatchRow m={i.top} /></ul> : <p className="mt-2 text-sm text-ink-3">No close match.</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-ink-3">{queue.note}</p>
      </section>

      <section aria-labelledby="clusters-h" className="mt-10">
        <h2 id="clusters-h" className="mb-1 flex items-center gap-2 text-xl font-semibold"><Layers size={18} aria-hidden /> Cluster suggestions</h2>
        <p className="mb-4 text-sm text-ink-3">Published shared insights grouped by shared wording (average-linkage, similarity ≥ {clusters.threshold}). Organisation breadth appears only as a band once at least {clusters.k} distinct organisations contribute.</p>
        {clusters.clusters.length === 0 ? <EmptyState title="No clusters yet" body="No two published insights share enough wording." /> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {clusters.clusters.map((c) => (
              <li key={c.members.map((m) => m.id).join()} className="panel-solid p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">Suggested label: {c.label.join(' · ')}</p>
                  <span className={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</span>
                </div>
                <p className="mt-1 text-xs text-ink-3">{c.orgBand ? `${c.orgBand} organisations` : `Fewer than ${clusters.k} organisations — no count shown`} · {c.members.length} shared insights · cohesion {c.cohesion}</p>
                <p className="mt-2 text-sm text-ink-2">{c.statusText}</p>
                {c.themes.length > 0 && <p className="mt-1 text-xs">Linked theme{c.themes.length > 1 ? 's' : ''}: {c.themes.map((t) => `${t.name} (${t.linkedMembers})`).join(', ')}</p>}
                <ul className="mt-2 grid gap-1 text-sm">
                  {c.members.map((m) => (
                    <li key={m.id}><Link className="underline-offset-2 hover:underline" href={`/community/${m.id}`}>{m.title}</Link><span className="text-xs text-ink-3">{m.period && ` · ${m.period}`}{m.theme ? ` · ${m.theme.name}` : ' · not linked to a theme'}</span></li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">Uncertainty: {c.uncertainty}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3"><MethodNote>{clusters.note}</MethodNote></div>
      </section>
    </>
  );
}
