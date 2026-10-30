'use client';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { api, errorText } from '@/lib/client';

type Persona = { group: string; label: string; email: string; tone: string };

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function LoginPanel({ initialTab, microsoft, microsoftConfigured, magicLink, personas }: { initialTab: 'employee' | 'client'; microsoft: boolean; microsoftConfigured: boolean; magicLink: boolean; personas: Persona[] }) {
  const [tab, setTab] = useState(initialTab);
  const [redirecting, setRedirecting] = useState(false);
  const [showEmail, setShowEmail] = useState(!microsoft);
  const [queued, setQueued] = useState<{ email: string; devMailbox?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendLink(email: string) {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ devMailbox?: string }>('/api/auth/magic-link', { body: { email } });
      setQueued({ email, devMailbox: r.devMailbox });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const emailForm = (placeholder: string, cta: string) => (
    <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); sendLink(String(new FormData(e.currentTarget).get('email'))); }}>
      <label className="label" htmlFor="email">Work email</label>
      <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder={placeholder} />
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} aria-hidden />} {cta}</button>
    </form>
  );

  return (
    <div className="w-full max-w-md" data-persona={tab === 'employee' ? 'employee' : 'client'}>
      <div className="panel-glass p-6 md:p-8">
        <div role="tablist" aria-label="Sign in as" className="relative grid grid-cols-2 rounded-full border border-line-2 bg-surface-deep p-1">
          {(['employee', 'client'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setQueued(null); setErr(null); }} className="relative min-h-[40px] rounded-full text-sm font-semibold">
              {tab === t && <motion.span layoutId="login-pill" className={`absolute inset-0 rounded-full ${t === 'employee' ? 'bg-amber' : 'bg-violet'}`} />}
              <span className={`relative ${tab === t ? 'text-[#04121a]' : 'text-ink-2'}`}>{t === 'employee' ? 'Azentio employee' : 'Client'}</span>
            </button>
          ))}
        </div>

        {queued ? (
          <div className="mt-6 space-y-3" role="status">
            <p className="flex items-center gap-2 text-lg font-semibold"><CheckCircle2 className="text-accent" size={20} aria-hidden /> Link queued</p>
            <p className="text-sm text-ink-2">If <strong>{queued.email}</strong> can sign in, a single-use link (valid 15 minutes) has been queued for delivery. It has not been confirmed as delivered.</p>
            {queued.devMailbox && <Link href={queued.devMailbox} className="btn btn-ghost btn-sm">Open dev mailbox (demo mode)</Link>}
            <button className="btn btn-ghost btn-sm" onClick={() => setQueued(null)}>Use a different email</button>
          </div>
        ) : tab === 'employee' ? (
          <div className="mt-6">
            <h2 className="text-xl font-semibold">Sign in with your work account</h2>
            {microsoft ? (
              <a href="/api/auth/microsoft/start" onClick={() => setRedirecting(true)} className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-3 rounded-md border border-[#8c8c8c] bg-white px-4 font-semibold text-[#5e5e5e] transition-shadow hover:shadow-lg">
                {redirecting ? <><Loader2 className="animate-spin" size={18} /> Redirecting to Microsoft…</> : <><MicrosoftLogo /> Sign in with Microsoft</>}
              </a>
            ) : (
              <p className="mt-4 rounded-xl border border-line-2 p-3 text-sm text-ink-3">{microsoftConfigured ? 'Microsoft sign-in is disabled by an administrator.' : 'Microsoft Entra ID is not configured in this environment (set AZURE_AD_* to enable).'} Use an email sign-in link.</p>
            )}
            <ul className="mt-5 space-y-2 text-sm text-ink-3">
              <li className="flex gap-2"><ShieldCheck size={16} className="shrink-0 text-amber" aria-hidden /> Only the Azentio Entra tenant is accepted.</li>
              <li className="flex gap-2"><ShieldCheck size={16} className="shrink-0 text-amber" aria-hidden /> Portal access also needs an approved employee membership.</li>
              <li className="flex gap-2"><ShieldCheck size={16} className="shrink-0 text-amber" aria-hidden /> Admin, moderator and publisher rights are separate grants.</li>
            </ul>
            {magicLink && (showEmail ? emailForm('you@azentio.com', 'Email me a sign-in link') : <button className="mt-4 text-sm text-ink-2 underline underline-offset-4" onClick={() => setShowEmail(true)}>Email me a sign-in link instead</button>)}
          </div>
        ) : (
          <div className="mt-6">
            <h2 className="text-xl font-semibold">Client workspace sign-in</h2>
            <p className="mt-2 text-sm text-ink-3">Clients join by invitation from their organisation’s administrator. Already a member? We’ll email you a sign-in link.</p>
            {magicLink ? emailForm('you@yourbank.example', 'Send sign-in link') : <p className="mt-4 text-sm text-coral">Email sign-in is disabled.</p>}
          </div>
        )}
        {err && <p role="alert" className="error mt-3">{err}</p>}
      </div>

      {personas.length > 0 && !queued && (
        <div className="panel-deep mt-5 p-5">
          <p className="font-mono text-xs text-amber">DEMO MODE · synthetic personas</p>
          <p className="mt-1 text-xs text-ink-3">Each button requests a real magic link through the same flow; open it from the dev mailbox.</p>
          {['Azentio', 'Clients'].map((g) => (
            <div key={g} className="mt-3 flex flex-wrap gap-2">
              {personas.filter((p) => p.group === g).map((p) => (
                <button key={p.email} disabled={busy} onClick={() => sendLink(p.email)} className="chip hover:border-accent" title={p.email}>{p.label}</button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
