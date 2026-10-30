'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Copy } from 'lucide-react';
import { api, errorText } from '@/lib/client';
import { fmtDate } from '@/components/ui';

type Member = { id: string; userId: string; name: string; email: string; role: string; status: string; since: string };
type Invite = { id: string; email: string; role: string; state: string; expiresAt: string };
const ROLE: Record<string, string> = { client_member: 'Member', client_admin: 'Administrator', employee: 'Employee' };

/** CLI-06: invite / revoke / change client roles. Platform roles are offered only so the server can visibly refuse them. */
export function TeamManager({ selfId, members, invitations }: { selfId: string; members: Member[]; invitations: Invite[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ tone: 'ok', text: ok }); router.refresh(); } catch (e) { setMsg({ tone: 'err', text: errorText(e) }); }
  };

  return (
    <div className="space-y-6">
      {msg && <p role={msg.tone === 'err' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${msg.tone === 'err' ? 'border-coral/40 bg-coral/10 text-coral' : 'border-teal/40 bg-teal/10 text-teal'}`}>{msg.text}</p>}
      <section className="panel-solid p-6">
        <h2 className="font-semibold">Invite a colleague</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await run(async () => {
            const r = await api<{ url: string }>('/api/team/invitations', { body: { email: f.get('email'), role: f.get('role') } });
            setLink(r.url);
          }, 'Invitation created. Email is queued (not yet confirmed delivered).');
        }}>
          <div><label className="label" htmlFor="inv-email">Work email</label><input id="inv-email" name="email" type="email" required className="input" /></div>
          <div>
            <label className="label" htmlFor="inv-role">Role</label>
            <select id="inv-role" name="role" className="select">
              <option value="client_member">Member</option>
              <option value="client_admin">Administrator</option>
              <optgroup label="Platform roles — Azentio only">
                <option value="moderator">Learning moderator</option>
                <option value="employee">Azentio employee</option>
              </optgroup>
            </select>
          </div>
          <button className="btn btn-primary self-end">Send invitation</button>
        </form>
        <p className="hint">Single-use, expires in 7 days, and can only be accepted by the invited verified email.</p>
        {link && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line p-3 font-mono text-xs">
            <span className="truncate">{link}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(link)} aria-label="Copy invitation link"><Copy size={14} aria-hidden /></button>
          </div>
        )}
      </section>

      <section className="panel-solid p-6">
        <h2 className="font-semibold">Members</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-2">Name</th><th>Role</th><th>Status</th><th>Since</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="py-3"><p className="font-medium">{m.name}</p><p className="text-xs text-ink-3">{m.email}</p></td>
                  <td>
                    {m.userId === selfId || m.status !== 'active' ? ROLE[m.role] : (
                      <select aria-label={`Role for ${m.name}`} className="select !min-h-9 !w-auto !py-1" defaultValue={m.role} onChange={(e) => run(() => api(`/api/team/members/${m.id}`, { method: 'PATCH', body: { role: e.target.value } }), `Role updated. ${m.name}'s sessions were signed out.`)}>
                        <option value="client_member">Member</option>
                        <option value="client_admin">Administrator</option>
                        <optgroup label="Platform roles — Azentio only"><option value="moderator">Learning moderator</option><option value="portal_admin">Portal administrator</option></optgroup>
                      </select>
                    )}
                  </td>
                  <td><span className={`chip ${m.status === 'active' ? 'border-teal/40 text-teal' : 'text-muted'}`}>{m.status}</span></td>
                  <td className="text-xs text-ink-3">{fmtDate(m.since)}</td>
                  <td className="text-right">{m.userId !== selfId && m.status === 'active' && <button className="btn btn-danger btn-sm" onClick={() => confirm(`Revoke ${m.name}?`) && run(() => api(`/api/team/members/${m.id}`, { method: 'DELETE' }), 'Membership revoked and sessions ended.')}>Revoke</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel-solid p-6">
        <h2 className="font-semibold">Invitations</h2>
        {invitations.length === 0 ? <p className="mt-3 text-sm text-ink-3">No invitations yet.</p> : (
          <ul className="mt-4 space-y-2">
            {invitations.map((i) => (
              <li key={i.id} className="panel-deep flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <span>{i.email} · {ROLE[i.role]}</span>
                <span className="flex items-center gap-2">
                  <span className="chip">{i.state}{i.state === 'pending' ? ` · expires ${fmtDate(i.expiresAt)}` : ''}</span>
                  {i.state === 'pending' && <button className="btn btn-ghost btn-sm" onClick={() => run(() => api(`/api/team/invitations/${i.id}`, { method: 'DELETE' }), 'Invitation revoked.')}>Revoke</button>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
