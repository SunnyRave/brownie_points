'use client';
import { api } from '@/lib/client';
import { useAdminAction } from './OrgAdmin';

export function PeopleAdmin({ allowlist, pending }: { allowlist: { id: string; value: string }[]; pending: { id: string; email: string; name: string; status: string; createdAt: string }[] }) {
  const { run, banner } = useAdminAction();
  return (
    <div className="space-y-6">
      {banner}
      <section className="panel-solid p-6">
        <h2 className="font-semibold">Access requests</h2>
        <p className="mt-1 text-xs text-ink-3">Verified Azentio identities who signed in without approval.</p>
        <ul className="mt-4 space-y-2">
          {pending.length === 0 && <li className="text-sm text-ink-3">None.</li>}
          {pending.map((r) => (
            <li key={r.id} className="panel-deep flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <span>{r.name} · {r.email}</span>
              {r.status === 'pending' ? (
                <span className="flex gap-2">
                  <button className="btn btn-primary btn-sm" onClick={() => run(() => api(`/api/admin/access-requests/${r.id}`, { body: { decision: 'approved' } }), `${r.email} approved as employee (no extra grants).`)}>Approve employee</button>
                  <button className="btn btn-danger btn-sm" onClick={() => run(() => api(`/api/admin/access-requests/${r.id}`, { body: { decision: 'denied' } }), 'Request denied.')}>Deny</button>
                </span>
              ) : <span className="chip">{r.status}</span>}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel-solid p-6">
        <h2 className="font-semibold">Employee allow-list</h2>
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => api('/api/admin/allowlist', { body: { value: f.get('value') } }), 'Added to allow-list.'); e.currentTarget.reset(); }}>
          <label className="sr-only" htmlFor="al">Email or Entra object ID</label>
          <input id="al" name="value" className="input" placeholder="name@azentio.com or Entra oid" required />
          <button className="btn btn-primary">Add</button>
        </form>
        <ul className="mt-4 flex flex-wrap gap-2">{allowlist.map((a) => <li key={a.id} className="chip">{a.value}</li>)}</ul>
      </section>
    </div>
  );
}
