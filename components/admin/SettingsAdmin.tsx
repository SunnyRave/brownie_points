'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { useAdminAction } from './OrgAdmin';

export function SettingsAdmin({ kThreshold, authMethods, effective, demo, env }: { kThreshold: number; authMethods: string[]; effective: string[]; demo: boolean; env: { microsoft: boolean; email: boolean; llm: boolean; db: string } }) {
  const { run, banner } = useAdminAction();
  const [k, setK] = useState(kThreshold);
  const [methods, setMethods] = useState(authMethods);
  const toggle = (m: string) => setMethods(methods.includes(m) ? methods.filter((x) => x !== m) : [...methods, m]);
  return (
    <div className="space-y-6">
      {banner}
      <section className="panel-solid space-y-5 p-6">
        <div>
          <label className="label" htmlFor="k">Minimum distinct organisations (k) for shared statistics</label>
          <input id="k" type="number" min={3} max={50} value={k} onChange={(e) => setK(Number(e.target.value))} className="input !w-32" />
          <p className="hint">Judging uses 3. A production threshold and suppression policy must be approved before launch; a minimum cohort size alone is not a privacy guarantee.</p>
        </div>
        <fieldset>
          <legend className="label">Sign-in methods</legend>
          {['microsoft', 'magiclink'].map((m) => (
            <label key={m} className="mr-6 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={methods.includes(m)} onChange={() => toggle(m)} className="h-5 w-5 accent-[var(--teal)]" /> {m === 'microsoft' ? 'Microsoft Entra ID' : 'Email magic link'}</label>
          ))}
          <p className="hint">Effective now: {effective.join(', ') || 'none'} (environment configuration can only narrow this).</p>
        </fieldset>
        <button className="btn btn-primary" onClick={() => run(() => api('/api/admin/settings', { body: { kThreshold: k, authMethods: methods } }), 'Settings saved and audited.')}>Save settings</button>
      </section>
      <section className="panel-deep p-6 text-sm">
        <h2 className="font-semibold">Environment</h2>
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          <li>Database: {env.db}</li>
          <li>Microsoft Entra ID: {env.microsoft ? 'configured' : 'not configured'}</li>
          <li>Email provider: {env.email ? 'configured (status: sent after provider accepts)' : 'none — emails stay “queued”'}</li>
          <li>AIRA generation: {env.llm ? 'Claude via Anthropic API' : 'extractive (no LLM key)'}</li>
        </ul>
      </section>
      {demo && (
        <section className="panel-sim p-6">
          <h2 className="font-semibold">Demo data</h2>
          <p className="mt-1 text-sm text-ink-3">Reset all data to the synthetic seed (6 fictional client organisations, demo personas). Signs everyone out.</p>
          <button className="btn btn-danger mt-4" onClick={() => confirm('Reset all demo data?') && run(() => api('/api/admin/reset', { method: 'POST', body: {} }), 'Demo data reset. Please sign in again.')}>Reset demo data</button>
        </section>
      )}
    </div>
  );
}
