import { Denied } from '@/components/ui';
import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { Card, EmployeeLabel, PageHeader, SimulatedRibbon, Stat, cx, fmtDate, fmtDateTime } from '@/components/ui';
import { RunRoundPanel } from '@/components/federated/RunRoundPanel';
import { ModelDecision } from '@/components/federated/ModelDecision';
import { requirePrincipal, guarded } from '@/lib/page';
import { getProgramme } from '@/lib/federated/service';
import { FL_ROLLBACK_DESIGN, FL_WITHDRAWAL_POLICY } from '@/lib/federated/policy';
import type { ParticipantRecord } from '@/lib/federated/types';

export const dynamic = 'force-dynamic';

type M = { accuracy: number; logLoss: number; auc: number };
type RoundMetrics = {
  cohort?: Record<string, number>;
  weighting?: string;
  majorityBaseline?: M;
  previousGlobal?: M & { version: string };
  global?: M;
  localModelKind?: string;
  localModels?: (M & { label: string; outcome: string; valAccuracy?: number })[];
  skewNote?: string;
  abortReason?: string;
  dp?: { applied: boolean; noiseMultiplier?: number; accounting?: string };
  holdout?: { version: string; examples: number; positiveRate: number };
};

const STATUS_TONE: Record<string, string> = {
  candidate: 'border-amber/40 text-amber',
  approved: 'border-violet/40 text-violet-text',
  deployed: 'border-teal/40 text-teal',
  rejected: 'border-coral/40 text-coral',
  rolled_back: 'text-muted',
  completed: 'border-teal/40 text-teal',
  aborted: 'border-coral/40 text-coral',
  accepted: 'border-teal/40 text-teal',
  dropped: 'border-amber/40 text-amber',
  enrolled: 'border-teal/40 text-teal',
  withdrawn: 'text-muted',
};
const Pill = ({ s, children }: { s: string; children?: React.ReactNode }) => <span className={cx('chip', STATUS_TONE[s])}>{children ?? s.replace('_', ' ')}</span>;
const pct = (x?: number) => (x === undefined ? '—' : `${(x * 100).toFixed(1)}%`);

const CONTROLS: { control: string; status: 'implemented' | 'simulated' | 'not implemented'; detail: string }[] = [
  { control: 'Programme consent separate from membership/publishing', status: 'implemented', detail: 'Client admins opt in per organisation with a versioned consent; withdrawal is immediate and audited.' },
  { control: 'Raw training records stay local', status: 'simulated', detail: 'Each participant reads only storage/federated/<key>/; the coordinator never imports data loading. All "environments" run on one server here.' },
  { control: 'Authenticated participants', status: 'simulated', detail: 'Per-participant HMAC over the update, key derived server-side from AUTH_SECRET. Production: mTLS / attested workload identity.' },
  { control: 'Update validation', status: 'implemented', detail: 'Enrolment, round binding, schema version, dimension, base version, finite values, plausible example counts, one update per participant.' },
  { control: 'Minimum cohort', status: 'implemented', detail: 'Fewer than 3 accepted updates aborts the round; nothing is registered.' },
  { control: 'Bounded / clipped updates', status: 'implemented', detail: 'L2 clipping of every accepted update before averaging; weight per participant capped.' },
  { control: 'Poisoning checks', status: 'implemented', detail: 'Heuristic: norm > 3× cohort median, or negative cosine to the coordinate-wise median. Can miss subtle attacks and can reject honest outliers.' },
  { control: 'Secure aggregation', status: 'not implemented', detail: 'The coordinator sees each individual update in the clear. Plain weighted averaging is not secure aggregation.' },
  { control: 'Differential privacy', status: 'not implemented', detail: 'Optional Gaussian noise on the clipped aggregate is a design sketch (off by default) with no privacy accounting — no formal (ε, δ) guarantee is claimed.' },
  { control: 'Human review before deployment', status: 'implemented', detail: 'Aggregates are candidates; approve → deploy → rollback each need a portal admin, a note, and are audited.' },
  { control: 'Training examples kept out of coordinator logs', status: 'implemented', detail: 'Round rows store per-participant metadata, hashes and metrics only; a test asserts no example rows appear.' },
];
const CTRL_ICON = { implemented: CheckCircle2, simulated: CircleDashed, 'not implemented': XCircle };
const CTRL_TONE = { implemented: 'text-teal', simulated: 'text-amber', 'not implemented': 'text-coral' };

export default async function Federated() {
  const p = await requirePrincipal('/hub/federated');
  const r = await guarded(() => getProgramme(p));
  if (!r.ok) return <Denied status={r.status} />;
  const d = r.data;
  const completed = d.rounds.filter((r) => r.status === 'completed').length;

  return (
    <>
      <PageHeader
        eyebrow="P2 · optional, opt-in track"
        title="Federated model-learning programme"
        description={<span className="flex flex-wrap items-center gap-2">Client environments train a shared model locally and send governed model updates for aggregation. Raw training records never leave the participant. <EmployeeLabel /></span>}
      />
      <div className="mb-6"><SimulatedRibbon text="SIMULATED · synthetic data · client environments are isolated directories on one server" /></div>

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <Card variant="deep">
          <p className="eyebrow">Not federated learning</p>
          <h2 className="mt-1 font-semibold">Collective learning hub</h2>
          <p className="mt-2 text-sm text-ink-3">Observations are submitted, moderated and published as shared insights. That is a governed knowledge exchange — no model is trained, and centralising observations to train on them would not be federated training. It stays a separate feature.</p>
        </Card>
        <Card>
          <p className="eyebrow">This programme</p>
          <h2 className="mt-1 font-semibold">Federated training</h2>
          <p className="mt-2 text-sm text-ink-3">Separately consented participants run an approved local training job; only signed weight updates reach the coordinator, which validates, clips and averages them into a candidate model evaluated on its own holdout.</p>
        </Card>
      </section>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Stat label="Enrolled participants" value={d.enrolledCount} />
        <Stat label="Rounds (completed / total)" value={`${completed} / ${d.rounds.length}`} />
        <Stat label="Deployed model" value={d.deployedVersion ?? '—'} tone="text-teal" />
        <Stat label="Holdout (separate synthetic set)" value={`${d.task.holdout.examples}`} />
      </div>

      {d.isAdmin && <div className="mb-6"><RunRoundPanel enrolled={d.enrolledCount} minCohort={d.task.defaults.minCohort} base={d.deployedVersion} /></div>}

      <Card className="mb-6">
        <h2 className="font-semibold">Learning task, model and feature schema</h2>
        <p className="mt-2 text-sm text-ink-2">
          Binary logistic regression (bias + {d.task.features.length} weights) predicting whether a <strong>synthetic</strong> SME credit application needs human credit review. Schema <span className="font-mono">{d.task.schemaVersion}</span>. Local job: {d.task.defaults.localEpochs} epochs of full-batch gradient descent from the deployed model, 80/20 local train/validation split.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-2">#</th><th>Feature</th><th>Meaning</th><th className="text-right">Agreed mean</th><th className="text-right">Agreed sd</th></tr></thead>
            <tbody>{d.task.features.map((f, i) => (
              <tr key={f.key} className="border-t border-line"><td className="py-2 font-mono text-xs">{i + 1}</td><td className="font-mono text-xs">{f.key}</td><td className="text-ink-3">{f.description}</td><td className="text-right font-mono text-xs">{f.mean}</td><td className="text-right font-mono text-xs">{f.sd}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <h3 className="mt-5 text-sm font-semibold">Compatibility assumptions</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-3">{d.task.compatibility.map((c) => <li key={c}>{c}</li>)}</ul>
        <p className="mt-3 text-sm text-ink-3">Each participant’s synthetic data is deliberately skewed (different feature means and spreads, review-rate policy and size). The holdout ({d.task.holdout.version}, {d.task.holdout.examples} rows, {pct(d.task.holdout.positiveRate)} positive) is generated independently from the unshifted population and never comes from a participant.</p>
      </Card>

      <Card className="mb-6">
        <h2 className="font-semibold">Participants & programme consent</h2>
        <p className="mt-1 text-sm text-ink-3">Pseudonymous labels are used in round logs.{d.isAdmin ? ' Organisation mapping is shown to portal admins only.' : ' The organisation mapping is visible to portal admins only.'}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-2">Participant</th>{d.isAdmin && <th>Organisation</th>}<th>Status</th><th>Consent</th>{d.isAdmin && <th>Consented by</th>}<th>Withdrawn</th></tr></thead>
            <tbody>{d.participants.map((x) => (
              <tr key={x.label} className="border-t border-line">
                <td className="py-2 font-mono text-xs">{x.label}</td>
                {d.isAdmin && <td>{'orgName' in x ? x.orgName : ''}</td>}
                <td><Pill s={x.status} /></td><td className="text-xs text-ink-3">{fmtDate(x.consentedAt)}</td>
                {d.isAdmin && <td className="text-xs text-ink-3">{'consentedBy' in x ? x.consentedBy : ''}</td>}
                <td className="text-xs text-ink-3">{fmtDate(x.withdrawnAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>

      <h2 className="mb-3 text-xl font-semibold">Rounds</h2>
      <div className="mb-8 space-y-4">
        {d.rounds.map((r) => {
          const m = r.metrics as RoundMetrics;
          const rows: [string, M | undefined][] = [
            ['Majority-class baseline', m.majorityBaseline],
            [`Previous global (${r.baseModelVersion})`, m.previousGlobal],
            ...((m.localModels ?? []).map((l) => [`${l.label} alone${l.outcome !== 'accepted' ? ` (${l.outcome})` : ''}`, l] as [string, M])),
            ...(m.global ? [[`New global ${r.modelVersion}`, m.global] as [string, M]] : []),
          ];
          return (
            <Card key={r.id} as="article">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Round {r.roundNo} <span className="font-mono text-xs text-ink-3">base {r.baseModelVersion} → {r.modelVersion}</span></h3>
                <div className="flex items-center gap-2"><Pill s={r.status} /><span className="font-mono text-xs text-muted">{fmtDateTime(r.startedAt)} · {r.startedBy}</span></div>
              </div>
              <p className="mt-1 text-xs text-ink-3">{m.weighting} · cohort {m.cohort?.accepted ?? 0} accepted / {m.cohort?.rejected ?? 0} rejected / {m.cohort?.dropped ?? 0} dropped of {m.cohort?.invited ?? 0} invited (min {m.cohort?.minCohort}) · DP noise {m.dp?.applied ? `×${m.dp.noiseMultiplier} (simulated, no accounting)` : 'off'} · secure aggregation: no</p>
              {m.abortReason && <p className="mt-3 flex items-center gap-2 rounded-xl border border-coral/40 bg-coral/10 p-3 text-sm text-coral"><AlertTriangle size={14} aria-hidden /> Aborted — {m.abortReason}. No model registered.</p>}
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-xs">
                    <thead className="text-muted"><tr><th className="py-1.5">Participant</th><th>Outcome</th><th className="text-right">n</th><th className="text-right">‖Δ‖</th><th className="text-right">Weight</th><th>Reason / hash</th></tr></thead>
                    <tbody>{(r.participants as ParticipantRecord[]).map((x, i) => (
                      <tr key={i} className="border-t border-line align-top">
                        <td className="py-1.5 font-mono">{x.label}{x.simulated && <span className="ml-1 chip !py-0 border-amber/40 text-amber">sim: {x.simulated}</span>}</td>
                        <td><Pill s={x.outcome} /></td>
                        <td className="text-right font-mono">{x.numExamples ?? '—'}</td>
                        <td className="text-right font-mono">{x.updateNorm ?? '—'}{x.clipped ? ' ✂' : ''}</td>
                        <td className="text-right font-mono">{x.weight ?? '—'}</td>
                        <td className="max-w-[260px] text-ink-3">{x.reasons.length ? x.reasons.join('; ') : `hash ${x.updateHash ?? ''}`}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[380px] text-left text-xs">
                    <thead className="text-muted"><tr><th className="py-1.5">Holdout evaluation</th><th className="text-right">Accuracy</th><th className="text-right">Log-loss</th><th className="text-right">AUC</th></tr></thead>
                    <tbody>{rows.map(([label, x]) => x && (
                      <tr key={label} className={cx('border-t border-line', label.startsWith('New global') && 'font-semibold text-teal')}>
                        <td className="py-1.5">{label}</td><td className="text-right font-mono">{pct(x.accuracy)}</td><td className="text-right font-mono">{x.logLoss.toFixed(3)}</td><td className="text-right font-mono">{x.auc.toFixed(3)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                  {m.localModelKind && <p className="mt-1 text-[11px] text-muted">“alone” = {m.localModelKind}.</p>}
                </div>
              </div>
              {m.skewNote && <p className="mt-3 rounded-xl border border-line p-3 text-sm text-ink-2"><span className="font-medium">Skew: </span>{m.skewNote}</p>}
            </Card>
          );
        })}
      </div>

      <h2 className="mb-3 text-xl font-semibold">Model registry & lineage</h2>
      <p className="mb-3 text-sm text-ink-3">Every aggregate is registered as a <strong>candidate</strong>. It requires human review and an explicit deployment decision; nothing is deployed automatically.</p>
      <div className="mb-8 grid gap-3 md:grid-cols-2">
        {d.models.map((m) => (
          <Card key={m.id} as="article" className={cx(m.status === 'deployed' && 'ring-1 ring-teal/40')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-mono font-semibold">{m.version}</h3>
              <Pill s={m.status} />
            </div>
            <p className="mt-1 text-xs text-ink-3">Lineage: <span className="font-mono">{m.lineage.chain.join(' → ')}</span>{m.roundNo ? ` · round ${m.roundNo}` : ''}</p>
            {m.global && <p className="mt-1 text-xs text-ink-3">Holdout: acc {pct((m.global as M).accuracy)} · log-loss {(m.global as M).logLoss.toFixed(3)} · AUC {(m.global as M).auc.toFixed(3)}</p>}
            <p className="mt-1 text-xs text-ink-3">Contributors (incl. ancestors): {m.lineage.contributors.length ? m.lineage.contributors.join(', ') : 'none'}</p>
            {m.lineage.withdrawn.length > 0 && <p className="mt-2 flex items-center gap-1 text-xs text-amber"><AlertTriangle size={12} aria-hidden /> Includes contributions from withdrawn participant(s) {m.lineage.withdrawn.join(', ')} — not untrained; blocked from new deployment.</p>}
            {m.decisionNote && <p className="mt-2 text-xs text-ink-2">“{m.decisionNote}” — {m.decidedBy}, {fmtDate(m.decidedAt)}</p>}
            {m.status === 'candidate' && <p className="mt-2 text-xs text-amber">Awaiting human review.</p>}
            {d.isAdmin && <ModelDecision id={m.id} version={m.version} status={m.status} hasParent={!!m.parentVersion} />}
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <h2 className="font-semibold">Threat model</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-3">
          <li><strong>Updates leak information.</strong> Weight differences can reveal properties of local data (membership / attribute inference, gradient inversion for small cohorts). Local retention of raw records does not by itself give confidentiality, anonymity or regulatory compliance.</li>
          <li><strong>Malicious clients can poison training</strong> with scaled, flipped or targeted (backdoor) updates; a compromised but authenticated client passes authentication.</li>
          <li><strong>The coordinator is trusted</strong> here: it sees individual updates, holds the holdout and the participant key derivation secret.</li>
          <li><strong>Skew is not an attack but distorts results:</strong> clients with different populations or review policies pull the average; the global model can be worse than a local one for a given client.</li>
        </ul>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-2">Control</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>{CONTROLS.map((c) => {
              const Icon = CTRL_ICON[c.status];
              return (
                <tr key={c.control} className="border-t border-line align-top">
                  <td className="py-2 pr-3 font-medium">{c.control}</td>
                  <td className={cx('whitespace-nowrap pr-3', CTRL_TONE[c.status])}><span className="flex items-center gap-1"><Icon size={14} aria-hidden /> {c.status}</span></td>
                  <td className="text-ink-3">{c.detail}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Withdrawal & lineage policy</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-3">{FL_WITHDRAWAL_POLICY.map((x) => <li key={x}>{x}</li>)}</ul>
        </Card>
        <Card>
          <h2 className="font-semibold">Deployment & rollback design</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-3">{FL_ROLLBACK_DESIGN.map((x) => <li key={x}>{x}</li>)}</ul>
        </Card>
      </section>
    </>
  );
}
