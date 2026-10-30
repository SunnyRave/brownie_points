'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import { api, errorText } from '@/lib/client';

type Option = { orgId: string; name: string; slug: string; kind: 'client' | 'azentio' };

async function switchTo(o: Option) {
  if (o.kind === 'azentio') return '/hub';
  const r = await api<{ orgSlug: string }>('/api/session/workspace', { body: { orgId: o.orgId } });
  return `/w/${r.orgSlug}`;
}

/** IAM-09: active organisation always visible; switching is a server-side session change. */
export function WorkspaceSwitcher({ active, options }: { active: string; options: Option[] }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  if (options.length <= 1)
    return <span className="chip border-accent/50 text-ink"><Building2 size={12} aria-hidden /> {active}</span>;
  return (
    <details className="relative">
      <summary className="chip cursor-pointer list-none border-accent/50 text-ink"><Building2 size={12} aria-hidden /> {active} <ChevronDown size={12} aria-hidden /></summary>
      <ul className="panel-solid absolute right-0 z-50 mt-2 w-64 p-2">
        {options.map((o) => (
          <li key={o.orgId}>
            <button className="w-full rounded-xl px-3 py-3 text-left text-sm hover:bg-surface-deep" onClick={async () => {
              try { router.push(await switchTo(o)); router.refresh(); } catch (e) { setErr(errorText(e)); }
            }}>{o.name}</button>
          </li>
        ))}
        {err && <li className="error px-3">{err}</li>}
      </ul>
    </details>
  );
}

export function WorkspaceChooser({ options }: { options: Option[] }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <ul className="mt-6 space-y-2">
      {options.map((o) => (
        <li key={o.orgId}>
          <button className="panel-solid flex w-full items-center justify-between p-4 text-left transition-transform hover:-translate-y-0.5" onClick={async () => {
            try { router.push(await switchTo(o)); router.refresh(); } catch (e) { setErr(errorText(e)); }
          }}>
            <span className="font-semibold">{o.name}</span><span className="chip">{o.kind === 'azentio' ? 'Employee' : 'Client'}</span>
          </button>
        </li>
      ))}
      {err && <li className="error">{err}</li>}
    </ul>
  );
}
