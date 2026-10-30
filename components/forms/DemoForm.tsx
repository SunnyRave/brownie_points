'use client';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';
import { leadSchema } from '@/lib/validation';

export function DemoForm({ offerings }: { offerings: { id: string; name: string }[] }) {
  const [startedAt] = useState(() => Date.now());
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: String(f.get('name') ?? ''), email: String(f.get('email') ?? ''), company: String(f.get('company') ?? ''),
      offeringInterest: String(f.get('offering') ?? '') || null, message: String(f.get('message') ?? ''), consent: f.get('consent') === 'on',
      website: String(f.get('website') ?? ''), startedAt,
    };
    const parsed = leadSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrors({});
    setState('busy');
    try {
      await api('/api/leads', { body });
      setState('done');
    } catch (err) {
      setMsg(errorText(err));
      setState('idle');
    }
  }

  if (state === 'done')
    return (
      <div className="panel-solid p-8" role="status">
        <h2 className="text-2xl font-semibold">Thanks — request received.</h2>
        <p className="mt-2 text-ink-2">Your request is stored. A confirmation email is <strong>queued</strong>; we’ll be in touch.</p>
      </div>
    );
  const field = (name: string, label: string, type = 'text', auto?: string) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} autoComplete={auto} className="input" aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${name}-err` : undefined} />
      {errors[name] && <p id={`${name}-err`} className="error">{errors[name]}</p>}
    </div>
  );
  return (
    <form onSubmit={submit} noValidate className="panel-solid grid gap-5 p-6 md:grid-cols-2 md:p-8">
      {field('name', 'Full name', 'text', 'name')}
      {field('email', 'Work email', 'email', 'email')}
      {field('company', 'Company', 'text', 'organization')}
      <div>
        <label className="label" htmlFor="offering">Interested in</label>
        <select id="offering" name="offering" className="select"><option value="">Not sure yet</option>{offerings.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      </div>
      <div className="md:col-span-2">
        <label className="label" htmlFor="message">What would you like to see? (optional)</label>
        <textarea id="message" name="message" className="textarea" maxLength={2000} />
        <p className="hint">Please don’t include customer or confidential information.</p>
      </div>
      <div className="hidden" aria-hidden><label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
      <label className="flex items-start gap-3 text-sm md:col-span-2">
        <input type="checkbox" name="consent" className="mt-1 h-5 w-5 accent-[var(--teal)]" />
        <span>I agree that azentio.ai may store these details and contact me about this request.</span>
      </label>
      {errors.consent && <p className="error md:col-span-2">{errors.consent}</p>}
      {msg && <p className="error md:col-span-2" role="alert">{msg}</p>}
      <div className="md:col-span-2"><button className="btn btn-primary" disabled={state === 'busy'}>{state === 'busy' ? 'Sending…' : 'Request demo'}</button></div>
    </form>
  );
}
