import Link from 'next/link';
import { Denied, PageHeader, PrivateLabel, SharedLabel, StatePill, Who, fmtDateTime } from '@/components/ui';
import { SharePanel } from '@/components/learning/SharePanel';
import { WithdrawPanel } from '@/components/learning/WithdrawPanel';
import { DeleteDraft } from '@/components/learning/DeleteDraft';
import { Composer } from '@/components/learning/Composer';
import { requirePrincipal, guarded } from '@/lib/page';
import { getObservation } from '@/lib/services/observations';
import { allOfferings } from '@/lib/services/workspace';
import { STATE_LABELS, canTransition, whoCanSee, type ObservationState } from '@/lib/learning/stateMachine';
import { OBSERVATION_TYPE_LABELS } from '@/lib/validation';

export default async function ObservationDetail({ params, searchParams }: { params: Promise<{ orgSlug: string; id: string }>; searchParams: Promise<{ share?: string; edit?: string }> }) {
  const { orgSlug, id } = await params;
  const sp = await searchParams;
  const p = await requirePrincipal();
  const r = await guarded(() => getObservation(p, id));
  if (!r.ok) return <Denied status={r.status === 404 ? 404 : r.status} message={r.status === 404 ? 'This record doesn’t exist in your active workspace.' : undefined} />;
  const { observation: o, reviews, consent, sharedCopy, sensitiveFlags } = r.data;
  const base = `/w/${orgSlug}`;
  const state = o.state as ObservationState;
  const who = whoCanSee(o.visibilityIntent as 'private', state);
  const canSubmit = o.isMine && (canTransition(state, 'submit', 'author') || canTransition(state, 'resubmit', 'author'));
  const canEdit = o.isMine && ['draft', 'returned', 'org_shared', 'published'].includes(state);
  const canWithdraw = o.isMine && canTransition(state, 'withdraw', 'author');
  const offerings = sp.edit && canEdit ? await allOfferings() : [];

  return (
    <>
      <PageHeader
        eyebrow={OBSERVATION_TYPE_LABELS[o.type as keyof typeof OBSERVATION_TYPE_LABELS]}
        title={o.title}
        description={<span className="flex flex-wrap items-center gap-2"><StatePill state={state} label={STATE_LABELS[state]} /><span className="chip">v{o.version}</span><PrivateLabel text="Source record — never shared directly" /></span>}
        actions={<>
          {canEdit && !sp.edit && <Link className="btn btn-ghost" href={`${base}/observations/${id}?edit=1`}>{state === 'published' ? 'Edit (new version)' : 'Edit'}</Link>}
          {o.isMine && state === 'draft' && <DeleteDraft id={id} back={`${base}/observations`} />}
        </>}
      />

      {sp.edit && canEdit ? (
        <Composer base={base} offerings={offerings} initial={{ ...o, id, offeringId: o.offeringId, industry: o.industry as never, topic: o.topic as never, evidenceType: o.evidenceType as never }} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <section className="panel-solid p-6">
              <Who icon={state === 'draft' || o.visibilityIntent === 'private' ? 'lock' : 'users'}>{who.label}</Who>
              <p className="mt-4 whitespace-pre-wrap leading-relaxed text-ink-2">{o.body}</p>
              <dl className="mt-6 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                {[['Region', o.region], ['Industry', o.industry], ['Topic', o.topic], ['Period', o.periodStart ? `${o.periodStart} → ${o.periodEnd ?? '…'}` : null], ['Evidence', o.evidenceType], ['Confidence', o.confidence], ['Updated', fmtDateTime(o.updatedAt)]].map(([k, val]) => (
                  <div key={k} className="panel-deep p-3"><dt className="text-[11px] text-muted">{k}</dt><dd>{val ?? '—'}</dd></div>
                ))}
              </dl>
              {o.isMine && sensitiveFlags.length > 0 && <p className="mt-4 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber">The automated check flagged {sensitiveFlags.length} possible sensitive item(s) for the moderator. It helps, but it can’t guarantee privacy.</p>}
            </section>

            {reviews.length > 0 && (
              <section className="panel-solid p-6">
                <h2 className="font-semibold">Moderation history</h2>
                <ul className="mt-3 space-y-3">{reviews.map((rv, i) => (
                  <li key={i} className="panel-deep p-4 text-sm"><p className="font-mono text-xs text-muted">v{rv.version} · {rv.decision} · {fmtDateTime(rv.at)}</p><p className="mt-1 text-ink-2">{rv.reason}</p></li>
                ))}</ul>
              </section>
            )}

            {sharedCopy && (
              <section className="panel-glass p-6">
                <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Approved shared version (v{sharedCopy.version})</h2><SharedLabel /></div>
                <p className="mt-1 text-xs text-ink-3">Status: {sharedCopy.status}. This reviewed, de-identified copy is all other organisations can see — not your source record.</p>
                <p className="mt-3 font-semibold">{sharedCopy.title}</p>
                <p className="mt-2 text-sm text-ink-2">{sharedCopy.body}</p>
                <p className="mt-3 font-mono text-xs text-muted">{sharedCopy.region ?? 'Region withheld'} · {sharedCopy.period ?? 'Period withheld'} · {sharedCopy.attribution ? `Attributed to ${sharedCopy.attribution}` : 'Not attributed'}</p>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            {consent && (
              <section className="panel-solid p-5 text-sm">
                <h2 className="font-semibold">Your permissions (v{consent.version})</h2>
                <ul className="mt-3 space-y-2">
                  {[['Store & process', consent.storeProcess], ['Publish reviewed shared copy', consent.publishShared], ['Show organisation attribution', consent.attribution], ['Future training / federated programme', consent.trainingProgramme]].map(([k, val]) => (
                    <li key={String(k)} className="flex justify-between gap-3"><span className="text-ink-2">{k}</span><span className={val ? 'text-teal' : 'text-muted'}>{val ? 'Granted' : 'Not granted'}</span></li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted">Consent history is kept append-only. Recorded {fmtDateTime(consent.at)}.</p>
              </section>
            )}
            {canSubmit && <SharePanel id={id} state={state} initialIntent={(sp.share as 'org' | 'propose_shared') ?? (state === 'returned' || state === 'org_shared' ? 'propose_shared' : undefined)} />}
            {canWithdraw && <WithdrawPanel id={id} title={sharedCopy?.title ?? o.title} sharedId={sharedCopy?.status === 'published' ? sharedCopy.id : null} />}
          </aside>
        </div>
      )}
    </>
  );
}
