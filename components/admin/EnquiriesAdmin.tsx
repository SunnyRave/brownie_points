'use client';
import { api } from '@/lib/client';
import { EmptyState, fmtDateTime } from '@/components/ui';
import { useAdminAction } from './OrgAdmin';

type Lead = { id: string; name: string; email: string; company: string; message: string | null; offering: string | null; status: 'new' | 'contacted' | 'closed'; createdAt: string };
type Reg = { id: string; name: string; email: string; team: string | null; status: 'registered' | 'waitlisted' | 'cancelled'; createdAt: string };
type Ev = { id: string; title: string; startsAt: string; capacity: number; registered: number; waitlisted: number; registrations: Reg[] };

const LEAD_LABEL = { new: 'New', contacted: 'Contacted', closed: 'Closed' } as const;
const LEAD_TONE = { new: 'border-amber/40 text-amber', contacted: 'border-teal/40 text-teal', closed: '' } as const;
const REG_TONE = { registered: 'border-teal/40 text-teal', waitlisted: 'border-amber/40 text-amber', cancelled: 'text-muted' } as const;

export function EnquiriesAdmin({ leads, events }: { leads: Lead[]; events: Ev[] }) {
  const { run, banner } = useAdminAction();
  const open = leads.filter((l) => l.status === 'new').length;
  return (
    <div className="space-y-8">
      {banner}
      <section aria-labelledby="leads-h" className="space-y-3">
        <h2 id="leads-h" className="text-xl font-semibold">Demo requests <span className="font-mono text-sm text-muted">{leads.length} total · {open} new</span></h2>
        {leads.length === 0 ? <EmptyState title="No demo requests yet" body="Requests from /demo appear here." /> : (
          <ul className="grid gap-3">
            {leads.map((l) => (
              <li key={l.id} className="panel-solid grid gap-2 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{l.name} · {l.company}</p>
                  <span className={`chip ${LEAD_TONE[l.status]}`}>{LEAD_LABEL[l.status]}</span>
                </div>
                <p className="text-sm text-ink-3">{l.email} · {l.offering ?? 'No specific product'} · {fmtDateTime(l.createdAt)}</p>
                {l.message && <p className="text-sm text-ink-2">“{l.message}”</p>}
                <div className="flex flex-wrap gap-2">
                  {(['new', 'contacted', 'closed'] as const).filter((s) => s !== l.status).map((s) => (
                    <button key={s} className="btn btn-ghost btn-sm" onClick={() => run(() => api(`/api/admin/enquiries/leads/${l.id}`, { body: { status: s } }), `Marked as ${LEAD_LABEL[s].toLowerCase()}.`)}>Mark {LEAD_LABEL[s].toLowerCase()}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {events.map((e) => (
        <section key={e.id} aria-labelledby={`ev-${e.id}`} className="space-y-3">
          <h2 id={`ev-${e.id}`} className="text-xl font-semibold">{e.title} <span className="font-mono text-sm text-muted">{e.registered}/{e.capacity} places · {e.waitlisted} waitlisted</span></h2>
          {e.registrations.length === 0 ? <EmptyState title="No registrations yet" body="Registrations from /hackathon appear here." /> : (
            <div className="panel-solid overflow-x-auto p-2">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-muted"><tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Team</th><th className="p-3">Status</th><th className="p-3">Registered</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {e.registrations.map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <td className="p-3">{r.name}</td>
                      <td className="p-3">{r.email}</td>
                      <td className="p-3">{r.team ?? '—'}</td>
                      <td className="p-3"><span className={`chip ${REG_TONE[r.status]}`}>{r.status}</span></td>
                      <td className="p-3 font-mono text-xs">{fmtDateTime(r.createdAt)}</td>
                      <td className="p-3 text-right">{r.status !== 'cancelled' && <button className="btn btn-ghost btn-sm" onClick={() => run(() => api(`/api/admin/enquiries/registrations/${r.id}`, { method: 'DELETE' }), `${r.name}'s registration cancelled. The waitlist was updated.`)}>Cancel</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
