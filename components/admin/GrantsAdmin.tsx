'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/client';
import { fmtDateTime } from '@/components/ui';
import { useAdminAction } from './OrgAdmin';

type G = { id: string; grant: string; email: string; name: string; scope: string; expiresAt: string | null; reason: string | null; scopeOrgId: string | null };

export function GrantsAdmin({ grants, orgs, selfEmail }: { grants: G[]; orgs: { id: string; name: string }[]; selfEmail: string }) {
  const { run, banner } = useAdminAction();
  const [grant, setGrant] = useState('moderator');
  return (
    <div className="space-y-6">
      {banner}
      <form className="panel-solid grid gap-3 p-6 md:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const hours = f.get('hours') ? Number(f.get('hours')) : null;
        run(() => api('/api/admin/grants', { body: { email: f.get('email'), grant, scopeOrgId: grant === 'support_access' ? f.get('scopeOrgId') : null, expiresInHours: hours, reason: f.get('reason') } }), 'Grant assigned and audited.');
      }}>
        <h2 className="font-semibold md:col-span-2">Assign a grant</h2>
        <div><label className="label" htmlFor="g-email">Employee email</label><input id="g-email" name="email" type="email" className="input" required defaultValue={grant === 'support_access' ? selfEmail : ''} key={grant} /></div>
        <div><label className="label" htmlFor="g-grant">Grant</label><select id="g-grant" className="select" value={grant} onChange={(e) => setGrant(e.target.value)}><option value="moderator">Learning moderator</option><option value="content_publisher">Content publisher</option><option value="product_owner">Product owner</option><option value="portal_admin">Portal administrator</option><option value="support_agent">Support agent (client tickets only)</option><option value="support_access">Support access (time-boxed, one org)</option></select></div>
        {grant === 'support_access' && <div><label className="label" htmlFor="g-org">Client organisation</label><select id="g-org" name="scopeOrgId" className="select">{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>}
        <div><label className="label" htmlFor="g-hours">Expires in (hours){grant === 'support_access' ? ' — max 8' : ' — optional'}</label><input id="g-hours" name="hours" type="number" min={1} max={grant === 'support_access' ? 8 : 8760} className="input" defaultValue={grant === 'support_access' ? 2 : undefined} required={grant === 'support_access'} /></div>
        <div className="md:col-span-2"><label className="label" htmlFor="g-reason">Reason (audited)</label><input id="g-reason" name="reason" className="input" required minLength={5} placeholder={grant === 'support_access' ? 'Ticket #1234: client asked for help with a returned item' : 'Joining moderation rota'} /></div>
        <button className="btn btn-primary w-fit">Assign</button>
      </form>
      <section className="panel-solid overflow-x-auto p-6">
        <h2 className="font-semibold">Active grants</h2>
        <table className="mt-4 w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-muted"><tr><th className="py-2">Person</th><th>Grant</th><th>Scope</th><th>Expires</th><th>Reason</th><th /></tr></thead>
          <tbody>{grants.map((g) => (
            <tr key={g.id} className="border-t border-line">
              <td className="py-3">{g.name}<p className="text-xs text-ink-3">{g.email}</p></td>
              <td><span className="chip">{g.grant.replace('_', ' ')}</span></td>
              <td className="text-xs">{g.scope}</td>
              <td className="text-xs">{g.expiresAt ? fmtDateTime(g.expiresAt) : '—'}</td>
              <td className="max-w-[220px] text-xs text-ink-3">{g.reason}</td>
              <td className="text-right">
                {g.grant === 'support_access' && g.scopeOrgId && g.email === selfEmail && <Link href={`/admin/support/${g.scopeOrgId}`} className="btn btn-ghost btn-sm mr-2">Open support view</Link>}
                <button className="btn btn-danger btn-sm" onClick={() => run(() => api(`/api/admin/grants/${g.id}`, { method: 'DELETE' }), 'Grant revoked.')}>Revoke</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </div>
  );
}
