import Link from 'next/link';
import { Denied, EmptyState, PageHeader, fmtDateTime } from '@/components/ui';
import { CommentDecision } from '@/components/moderation/CommentDecision';
import { requirePrincipal, guarded } from '@/lib/page';
import { commentModerationQueue } from '@/lib/services/comments';
import { EVIDENCE_QUALITY_LABELS } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const kindLabel = (k: string) => (k === 'employee' ? 'Azentio employee' : 'Client participant');

export default async function CommentModeration() {
  const p = await requirePrincipal('/moderate/comments');
  const r = await guarded(() => commentModerationQueue(p));
  if (!r.ok) return <Denied status={r.status} />;
  const q = r.data;
  return (
    <>
      <PageHeader eyebrow="Moderation" title="Comment moderation" description="Comments inherit the shared contribution’s audience. Flagged comments wait here before anyone else sees them. Every decision sends the author a reason; reporters are never named." />

      <section aria-labelledby="held-h" className="mb-10">
        <h2 id="held-h" className="mb-3 text-xl font-semibold">Held for review ({q.held.length})</h2>
        {q.held.length === 0 ? <EmptyState title="No held comments" /> : (
          <ul className="grid gap-4">
            {q.held.map((c) => (
              <li key={c.id} className="panel-solid p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <span className="chip">{kindLabel(c.authorKind)}</span>
                    {c.flagKinds.map((f) => <span key={f} className="chip border-amber/40 text-amber">{f.replace(/_/g, ' ')}</span>)}
                    {c.parentStatus !== 'published' && <span className="chip border-coral/40 text-coral">parent {c.parentStatus}</span>}
                  </div>
                  <span className="font-mono text-xs text-muted">{fmtDateTime(c.createdAt)}</span>
                </div>
                <p className="mt-2 text-xs text-ink-3">On: {c.parentTitle}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{c.body}</p>
                <CommentDecision id={c.id} actions={['approve', 'hide', 'remove']} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="rep-h" className="mb-10">
        <h2 id="rep-h" className="mb-3 text-xl font-semibold">Open comment reports ({q.reports.length})</h2>
        {q.reports.length === 0 ? <EmptyState title="No open comment reports" /> : (
          <ul className="grid gap-4">
            {q.reports.map((r) => (
              <li key={r.id} className="panel-solid p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2"><span className="chip border-coral/40 text-coral">{r.reason}</span><span className="chip">comment {r.commentStatus}</span><span className="chip">{kindLabel(r.authorKind)}</span></div>
                  <span className="font-mono text-xs text-muted">{fmtDateTime(r.createdAt)}</span>
                </div>
                <p className="mt-2 text-xs text-ink-3">On: {r.parentTitle}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{r.commentBody}</p>
                {r.details && <p className="mt-2 text-sm text-ink-3">Reporter details: {r.details}</p>}
                <CommentDecision id={r.commentId} actions={r.commentStatus === 'visible' ? ['dismiss', 'hide', 'remove'] : r.commentStatus === 'hidden' ? ['restore', 'remove'] : ['remove']} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {q.hidden.length > 0 && (
        <section aria-labelledby="hid-h" className="mb-10">
          <h2 id="hid-h" className="mb-3 text-xl font-semibold">Recently hidden</h2>
          <ul className="grid gap-4">
            {q.hidden.map((c) => (
              <li key={c.id} className="panel-deep p-5">
                <p className="text-xs text-ink-3">On: {c.parentTitle} · {kindLabel(c.authorKind)} · {fmtDateTime(c.updatedAt)}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{c.body}</p>
                <CommentDecision id={c.id} actions={['restore', 'remove']} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="ne-h">
        <h2 id="ne-h" className="mb-1 text-xl font-semibold">“Needs evidence” signals</h2>
        <p className="mb-3 text-sm text-ink-3">Participant feedback on published contributions, to inform evidence-quality review. Totals are per contribution only — never per organisation or author.</p>
        {q.needsEvidence.length === 0 ? <EmptyState title="No “needs evidence” feedback" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="py-2 pr-4 font-medium">Contribution</th><th className="py-2 pr-4 font-medium">Needs evidence</th><th className="py-2 pr-4 font-medium">Useful</th><th className="py-2 font-medium">Reviewer-assessed quality</th></tr></thead>
              <tbody>
                {q.needsEvidence.map((s) => (
                  <tr key={s.id} className="border-t border-line-2">
                    <td className="py-2 pr-4"><Link href={`/hub/community?item=${s.id}#item-${s.id}`} className="hover:underline">{s.title}</Link></td>
                    <td className="py-2 pr-4 font-mono text-amber">{s.needsEvidence}</td>
                    <td className="py-2 pr-4 font-mono">{s.useful}</td>
                    <td className="py-2">{s.evidenceQuality ? EVIDENCE_QUALITY_LABELS[s.evidenceQuality] : <span className="text-ink-3">not assessed</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
