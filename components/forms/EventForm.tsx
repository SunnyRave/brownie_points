'use client';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';

export function EventForm({ slug, full }: { slug: string; full: boolean }) {
  const [done, setDone] = useState<{ confirmation: string; duplicate: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (done)
    return (
      <div className="panel-solid p-8" role="status">
        <h2 className="text-2xl font-semibold">{done.duplicate ? 'You’re already registered.' : 'You’re registered!'}</h2>
        <p className="mt-2 text-ink-2">Confirmation <span className="font-mono text-teal">{done.confirmation}</span>. A confirmation email is queued.</p>
      </div>
    );
  return (
    <form
      className="panel-solid grid gap-5 p-6 md:p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErr(null);
        try {
          setDone(await api(`/api/events/${slug}/register`, { body: { name: f.get('name'), email: f.get('email'), team: f.get('team') || undefined, website: f.get('website') || undefined } }));
        } catch (x) {
          setErr(errorText(x));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div><label className="label" htmlFor="ev-name">Name</label><input id="ev-name" name="name" required minLength={2} className="input" autoComplete="name" /></div>
      <div><label className="label" htmlFor="ev-email">Email</label><input id="ev-email" name="email" type="email" required className="input" autoComplete="email" /></div>
      <div><label className="label" htmlFor="ev-team">Team name (optional)</label><input id="ev-team" name="team" className="input" /></div>
      <div className="hidden" aria-hidden><input name="website" tabIndex={-1} autoComplete="off" /></div>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn btn-primary w-fit" disabled={busy || full}>{full ? 'Event full' : busy ? 'Registering…' : 'Register interest'}</button>
    </form>
  );
}
