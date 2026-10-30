'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';
import { VisibilityLens, type LensValue } from '@/components/home/VisibilityLens';

/** OBS-04 / SHR-01/02: explicit sharing choice + four separate consents. Broadening needs consent + moderation. */
export function SharePanel({ id, state, initialIntent }: { id: string; state: string; initialIntent?: 'org' | 'propose_shared' }) {
  const router = useRouter();
  const orgAllowed = state === 'draft';
  const [intent, setIntent] = useState<LensValue>(initialIntent ?? (orgAllowed ? 'org' : 'propose_shared'));
  const [c, setC] = useState({ storeProcess: false, publishShared: false, attribution: false, trainingProgramme: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const shared = intent === 'propose_shared';
  const ready = intent !== 'private' && c.storeProcess && (!shared || c.publishShared);
  const box = (k: keyof typeof c, label: string, hint: string, disabled = false) => (
    <label className={`flex items-start gap-3 rounded-xl border border-line p-3 text-sm ${disabled ? 'opacity-50' : ''}`}>
      <input type="checkbox" disabled={disabled} checked={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.checked })} className="mt-0.5 h-5 w-5 accent-[var(--violet)]" />
      <span><span className="font-medium text-ink">{label}</span><span className="block text-xs text-ink-3">{hint}</span></span>
    </label>
  );
  return (
    <section id="share" className="panel-solid p-5">
      <h2 className="font-semibold">{state === 'returned' ? 'Resubmit for review' : 'Share this observation'}</h2>
      <p className="mt-1 text-xs text-ink-3">Nothing is shared until you submit. You can withdraw later.</p>
      <div className="mt-4"><VisibilityLens value={intent} onChange={(v) => setIntent(v === 'org' && !orgAllowed ? 'propose_shared' : v)} compact /></div>
      {intent === 'private' ? <p className="mt-3 text-sm text-ink-2">It’s already private. Choose Organisation or Community to share.</p> : (
        <div className="mt-4 space-y-2">
          {box('storeProcess', 'Store & process this contribution', 'Required to submit.')}
          {box('publishShared', 'Publish a reviewed, de-identified shared version', 'Required for the community. A moderator edits a separate copy first.', !shared)}
          {box('attribution', 'Show my organisation’s name on the shared version', 'Optional. Also needs moderator approval.', !shared)}
          {box('trainingProgramme', 'Include in any future training / federated-learning programme', 'Optional and separate. Not used by this portal today.')}
        </div>
      )}
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn btn-primary mt-4 w-full" disabled={!ready || busy} onClick={async () => {
        setBusy(true); setErr(null);
        try {
          await api(`/api/observations/${id}/submit`, { body: { visibilityIntent: intent, consents: { ...c, publishShared: shared && c.publishShared, attribution: shared && c.attribution } } });
          router.replace(location.pathname);
          router.refresh();
        } catch (e) { setErr(errorText(e)); setBusy(false); }
      }}>{intent === 'org' ? 'Share with my organisation' : 'Submit for moderation'}</button>
    </section>
  );
}
