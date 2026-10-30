'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';

type Org = { id: string; name: string; slug: string; type: string; members: number; industry: string | null; region: string | null };

export function useAdminAction() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setMsg(null); try { await fn(); setMsg({ ok: true, text: ok }); router.refresh(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } };
  const banner = msg && <p role={msg.ok ? 'status' : 'alert'} className={`rounded-xl border p-3 text-sm ${msg.ok ? 'border-teal/40 text-teal' : 'border-coral/40 text-coral'}`}>{msg.text}</p>;
  return { run, banner };
}

export function OrgAdmin({ orgs, offerings, entitlements }: { orgs: Org[]; offerings: { id: string; name: string }[]; entitlements: { orgId: string; offeringId: string; sandboxEnabled: boolean }[] }) {
  const { run, banner } = useAdminAction();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const state = (orgId: string, offeringId: string) => {
    const e = entitlements.find((x) => x.orgId === orgId && x.offeringId === offeringId);
    return e ? (e.sandboxEnabled ? 'sandbox' : 'entitled') : 'none';
  };
  const clients = orgs.filter((o) => o.type === 'client');
  return (
    <div className="space-y-6">
      {banner}
      <section className="panel-solid overflow-x-auto p-6">
        <h2 className="font-semibold">Entitlement matrix</h2>
        <table className="mt-4 w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-muted"><tr><th className="py-2">Organisation</th>{offerings.map((o) => <th key={o.id}>{o.name}</th>)}</tr></thead>
          <tbody>
            {clients.map((org) => (
              <tr key={org.id} className="border-t border-line">
                <td className="py-3"><p className="font-medium">{org.name}</p><p className="text-xs text-ink-3">{org.members} active members · /{org.slug}</p></td>
                {offerings.map((o) => (
                  <td key={o.id}>
                    <select aria-label={`${org.name} — ${o.name}`} className="select !min-h-9 !w-auto !py-1 text-xs" value={state(org.id, o.id)} onChange={(e) => run(() => api('/api/admin/entitlements', { body: { orgId: org.id, offeringId: o.id, state: e.target.value } }), 'Entitlement updated.')}>
                      <option value="none">—</option><option value="entitled">Entitled</option><option value="sandbox">+ Sandbox</option>
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <form className="panel-solid space-y-3 p-6" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => api('/api/admin/orgs', { body: { name: f.get('name'), slug: f.get('slug'), industry: f.get('industry') || undefined, region: f.get('region') || undefined } }), 'Organisation created.'); }}>
          <h2 className="font-semibold">Register a client organisation</h2>
          <div><label className="label" htmlFor="o-name">Name</label><input id="o-name" name="name" className="input" required /></div>
          <div><label className="label" htmlFor="o-slug">Slug</label><input id="o-slug" name="slug" className="input" pattern="[a-z0-9-]{2,40}" required /></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="o-ind">Industry</label><input id="o-ind" name="industry" className="input" /></div><div><label className="label" htmlFor="o-reg">Region</label><input id="o-reg" name="region" className="input" /></div></div>
          <button className="btn btn-primary">Create</button>
        </form>
        <form className="panel-solid space-y-3 p-6" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(async () => { const r = await api<{ url: string }>('/api/admin/invite', { body: { orgId: f.get('orgId'), email: f.get('email'), role: f.get('role') } }); setInviteLink(r.url); }, 'Invitation created (email queued).'); }}>
          <h2 className="font-semibold">Invite a client administrator</h2>
          <div><label className="label" htmlFor="i-org">Organisation</label><select id="i-org" name="orgId" className="select">{clients.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
          <div><label className="label" htmlFor="i-email">Email</label><input id="i-email" name="email" type="email" className="input" required /></div>
          <div><label className="label" htmlFor="i-role">Role</label><select id="i-role" name="role" className="select"><option value="client_admin">Client administrator</option><option value="client_member">Member</option></select></div>
          <button className="btn btn-primary">Create invitation</button>
          {inviteLink && <p className="break-all font-mono text-xs text-ink-3">{inviteLink}</p>}
        </form>
      </div>
    </div>
  );
}
