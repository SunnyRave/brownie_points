'use client';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';

export function EventForm({ slug, full }: { slug: string; full: boolean }) {
  const [done, setDone] = useState<{ status: 'registered' | 'waitlisted' | 'already_registered'; confirmation: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (done)
    return (
      <div className="panel-solid p-8" role="status">
        <h2 className="text-2xl font-semibold">{done.status === 'registered' ? 'You’re registered!' : done.status === 'waitlisted' ? 'You’re on the waitlist.' : 'Check your inbox.'}</h2>
        {done.status === 'already_registered' ? (
          <p className="mt-2 text-ink-2">This email address is already signed up. We’ve sent the confirmation to it again; it includes a link to cancel.</p>
        ) : (
          <p className="mt-2 text-ink-2">
            Confirmation <span className="font-mono text-teal">{done.confirmation}</span>.{' '}
            {done.status === 'waitlisted' ? 'The event is full. If a place opens up, you’ll move up automatically and we’ll email you.' : 'A confirmation email is on its way, with a link to cancel if your plans change.'}
          </p>
        )}
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
      <button className="btn btn-primary w-fit" disabled={busy}>{busy ? 'Registering…' : full ? 'Join the waitlist' : 'Register interest'}</button>
    </form>
  );
}
