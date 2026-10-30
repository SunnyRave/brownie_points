'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { api, errorText } from '@/lib/client';

export function InviteFlow({ token, signedInEmail, emailMatches }: { token: string; signedInEmail: string | null; emailMatches: boolean }) {
  const router = useRouter();
  const [queued, setQueued] = useState<{ devMailbox?: string } | null>(null);
  const [terms, setTerms] = useState(false);
  const [explainer, setExplainer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!signedInEmail || !emailMatches) {
    return (
      <div className="mt-6 space-y-4">
        {signedInEmail && (
          <p role="alert" className="rounded-xl border border-coral/40 bg-coral/10 p-3 text-sm text-coral">
            You’re signed in as {signedInEmail}, which doesn’t match this invitation. Accepting will be refused. Sign out and verify the invited address.
          </p>
        )}
        <p className="text-sm text-ink-2">Step 1 of 3 — verify your email. We’ll send a single-use link to the invited address.</p>
        {queued ? (
          <div role="status" className="space-y-2">
            <p className="font-semibold">Verification link queued.</p>
            {queued.devMailbox && <Link className="btn btn-ghost btn-sm" href={queued.devMailbox}>Open dev mailbox (demo mode)</Link>}
          </div>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={async () => {
            setBusy(true);
            try { setQueued(await api(`/api/invite/${token}/verify`, { method: 'POST', body: {} })); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
          }}>Verify my email</button>
        )}
        {err && <p className="error" role="alert">{err}</p>}
      </div>
    );
  }

  return (
    <form className="mt-6 space-y-5" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setErr(null);
      try {
        const r = await api<{ orgSlug: string }>(`/api/invite/${token}/accept`, { body: { terms, sharingExplainer: explainer } });
        router.push(`/w/${r.orgSlug}`);
        router.refresh();
      } catch (x) { setErr(errorText(x)); setBusy(false); }
    }}>
      <p className="text-sm text-ink-2">Step 2 of 3 — review before you join.</p>
      <div className="panel-deep space-y-2 p-4 text-sm text-ink-2">
        <p className="font-semibold text-ink">Workspace terms (summary)</p>
        <p>Your workspace is private to your organisation. Azentio employees cannot see it without an explicit, time-boxed and audited support authorisation.</p>
      </div>
      <div className="panel-glass space-y-2 p-4 text-sm text-ink-2">
        <p className="font-semibold text-ink">How sharing works</p>
        <p>Joining a workspace is <strong>not</strong> consent to share or train on your data. Observations start as private drafts. You choose: only you, your organisation, or propose a reviewed, de-identified copy to the learning community. Publishing, attribution and any future training programme are separate permissions you can decline.</p>
      </div>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 h-5 w-5 accent-[var(--violet)]" /> I accept the workspace terms.</label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={explainer} onChange={(e) => setExplainer(e.target.checked)} className="mt-1 h-5 w-5 accent-[var(--violet)]" /> I’ve read how sharing works and understand joining is not consent to share.</label>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn btn-primary" disabled={!terms || !explainer || busy}>Join workspace</button>
    </form>
  );
}
