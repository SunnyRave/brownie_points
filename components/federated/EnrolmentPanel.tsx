'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Network } from 'lucide-react';
import { api, errorText } from '@/lib/client';
import { fmtDate } from '@/components/ui';
import { FL_CONSENT_POINTS, FL_CONSENT_VERSION } from '@/lib/federated/policy';

type Status = { status: 'not_enrolled' | 'enrolled' | 'withdrawn'; label?: string; consentedAt?: string | null; withdrawnAt?: string | null; roundsContributed?: number };

/** Client-admin opt-in for the separate federated model-learning programme (own organisation only). */
export function EnrolmentPanel({ initial }: { initial: Status }) {
  const router = useRouter();
  const [agree, setAgree] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const s = initial;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); setAgree(false); setConfirmWithdraw(false); router.refresh(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  };

  return (
    <section className="panel-solid p-6" aria-labelledby="fl-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="fl-h" className="flex items-center gap-2 font-semibold"><Network size={16} aria-hidden /> Federated model-learning programme <span className="chip">Optional · P2</span></h2>
        <span className={`chip ${s.status === 'enrolled' ? 'border-teal/40 text-teal' : 'text-muted'}`}>
          {s.status === 'enrolled' ? `Enrolled as ${s.label} since ${fmtDate(s.consentedAt)}` : s.status === 'withdrawn' ? `Withdrawn ${fmtDate(s.withdrawnAt)}` : 'Not enrolled'}
        </span>
      </div>
      <p className="mt-2 text-sm text-ink-2">
        A separate programme where your environment trains a shared credit-review model locally and sends only model updates. This is not the collective learning hub, and it is not implied by workspace membership or by consent to store or publish observations.
      </p>
      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <div className="panel-deep p-4"><p className="font-medium text-teal">Leaves your environment</p><p className="mt-1 text-ink-3">Model weight differences, the number of training examples, local validation metrics, a signature.</p></div>
        <div className="panel-deep p-4"><p className="font-medium">Stays in your environment</p><p className="mt-1 text-ink-3">Training records and features, local validation data, labels.</p></div>
      </div>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink-3">{FL_CONSENT_POINTS.map((p) => <li key={p}>{p}</li>)}</ul>
      {s.status === 'enrolled' && <p className="mt-3 text-sm text-ink-3">Your updates were accepted in {s.roundsContributed ?? 0} completed round(s).</p>}

      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-4 rounded-xl border p-3 text-sm ${msg.ok ? 'border-teal/40 bg-teal/10 text-teal' : 'border-coral/40 bg-coral/10 text-coral'}`}>{msg.text}</p>}

      {s.status !== 'enrolled' ? (
        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
            <span>On behalf of my organisation I give programme consent ({FL_CONSENT_VERSION}) to the terms above. {s.status === 'withdrawn' && 'Re-enrolment applies to future rounds only.'}</span>
          </label>
          <button className="btn btn-primary" disabled={!agree} onClick={() => run(() => api('/api/federated/enrolment', { body: { consent: true, consentVersion: FL_CONSENT_VERSION } }), 'Enrolled. Your environment will be invited from the next round.')}>Enrol organisation</button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-ink-3">Withdrawal stops future participation immediately. Models already aggregated with your updates are not untrained; they are flagged in lineage and cannot be newly deployed.</p>
          {!confirmWithdraw ? (
            <button className="btn btn-danger" onClick={() => setConfirmWithdraw(true)}>Withdraw from programme…</button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-danger" onClick={() => run(() => api('/api/federated/enrolment', { method: 'DELETE' }), 'Withdrawn. You will not be invited to further rounds.')}>Confirm withdrawal</button>
              <button className="btn btn-ghost" onClick={() => setConfirmWithdraw(false)}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
