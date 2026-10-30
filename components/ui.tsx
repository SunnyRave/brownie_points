import clsx from 'clsx';
import Link from 'next/link';
import { Lock, FlaskConical, Users, Globe, ShieldCheck } from 'lucide-react';

export const cx = clsx;

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold md:text-4xl">{title}</h1>
        {description && <div className="mt-3 text-ink-2">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </header>
  );
}

export function Card({ children, className, variant = 'solid', as: As = 'section', ...rest }: { children: React.ReactNode; className?: string; variant?: 'solid' | 'glass' | 'deep' | 'sim'; as?: 'section' | 'article' | 'div' | 'li' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cx(variant === 'glass' ? 'panel-glass' : variant === 'deep' ? 'panel-deep' : variant === 'sim' ? 'panel-sim' : 'panel-solid', 'p-5 md:p-6', className)} {...rest}>
      {children}
    </As>
  );
}

/** Visible label for every cross-client surface. */
export function SharedLabel() {
  return (
    <span className="chip border-violet/40 text-violet-text">
      <Globe size={12} aria-hidden /> Shared community · de-identified
    </span>
  );
}
export function PrivateLabel({ text = 'Private to your organisation' }: { text?: string }) {
  return (
    <span className="chip">
      <Lock size={12} aria-hidden /> {text}
    </span>
  );
}
export function EmployeeLabel() {
  return (
    <span className="chip border-amber/40 text-amber">
      <ShieldCheck size={12} aria-hidden /> Employee only
    </span>
  );
}
export function SimulatedRibbon({ text = 'SIMULATED · synthetic data · not a credit or business decision' }: { text?: string }) {
  return (
    <div role="note" className="flex items-center gap-2 rounded-full border border-amber/50 bg-amber/10 px-4 py-2 font-mono text-xs tracking-wide text-amber">
      <FlaskConical size={14} aria-hidden /> {text}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="panel-deep flex flex-col items-center gap-3 px-6 py-12 text-center">
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden className="opacity-80">
        <circle cx="36" cy="36" r="30" fill="none" stroke="var(--border-2)" strokeDasharray="4 6" className="spin-slow" />
        <circle cx="36" cy="36" r="8" fill="var(--accent)" opacity=".6" className="pulse-core" />
      </svg>
      <p className="font-display text-lg">{title}</p>
      {body && <p className="max-w-md text-sm text-ink-3">{body}</p>}
      {action}
    </div>
  );
}

const STATE_TONE: Record<string, string> = {
  draft: 'text-ink-2 border-line-2',
  org_shared: 'text-violet-text border-violet/40',
  submitted: 'text-amber border-amber/40',
  in_review: 'text-amber border-amber/40',
  returned: 'text-coral border-coral/40',
  rejected: 'text-coral border-coral/40',
  published: 'text-teal border-teal/40',
  under_report: 'text-coral border-coral/40',
  unpublished: 'text-coral border-coral/40',
  removed: 'text-muted border-line-2',
  withdrawn: 'text-muted border-line-2',
};
export function StatePill({ state, label }: { state: string; label: string }) {
  return <span className={cx('chip', STATE_TONE[state])}>{label}</span>;
}

export function Denied({ status, message }: { status: number; message?: string }) {
  return (
    <main id="main" className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <Lock size={36} className="text-coral" aria-hidden />
      <h1 className="text-2xl font-semibold">{status === 401 ? 'Sign in required' : 'You don’t have access to this'}</h1>
      <p className="text-ink-2">{message ?? (status === 401 ? 'This area is private. Sign in to continue.' : 'Access is decided on the server from your verified identity, active workspace and grants.')}</p>
      <div className="flex gap-3">
        {status === 401 ? <Link className="btn btn-primary" href="/login">Sign in</Link> : <Link className="btn btn-ghost" href="/portal">Go to my portal</Link>}
      </div>
      <p className="font-mono text-xs text-muted">HTTP {status}</p>
    </main>
  );
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="panel-deep p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={cx('mt-1 font-display text-2xl font-semibold', tone)}>{value}</p>
    </div>
  );
}

export function Who({ icon = 'users', children }: { icon?: 'users' | 'lock' | 'globe'; children: React.ReactNode }) {
  const Icon = icon === 'lock' ? Lock : icon === 'globe' ? Globe : Users;
  return (
    <p className="flex items-center gap-2 text-xs text-ink-3">
      <Icon size={13} aria-hidden /> {children}
    </p>
  );
}

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
