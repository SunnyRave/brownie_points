import Link from 'next/link';
import { Denied, EmptyState, PageHeader, fmtDateTime, cx } from '@/components/ui';
import { TicketStatusPill } from '@/components/support/TicketThread';
import { CATEGORY_LABELS, STATUS_LABELS, TICKET_STATUSES } from '@/components/support/labels';
import { requirePrincipal, guarded } from '@/lib/page';
import { listDeskTickets } from '@/lib/services/support';

export default async function SupportDesk({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const p = await requirePrincipal('/hub/support');
  const r = await guarded(() => listDeskTickets(p, { status }));
  if (!r.ok) return <Denied status={r.status} message="The client support desk requires an explicit support-agent authorisation, not just an employee role." />;
  const filters = [{ key: undefined, label: 'All' }, ...TICKET_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s] }))];
  return (
    <>
      <PageHeader
        eyebrow="Client support"
        title="Support desk"
        description={<span className="flex flex-wrap items-center gap-2">Tickets clients have explicitly addressed to Azentio support. You see these threads only — not the organisation’s observations or other private content. <span className="chip border-amber/40 text-amber">Support agents only</span></span>}
      />
      <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link key={f.label} href={f.key ? `/hub/support?status=${f.key}` : '/hub/support'} className={cx('chip', (status ?? undefined) === f.key ? 'border-accent text-accent' : '')}>{f.label}</Link>
        ))}
      </nav>
      {r.data.length === 0 ? (
        <EmptyState title="No tickets" body="Nothing matches this filter." />
      ) : (
        <div className="panel-solid overflow-x-auto p-2">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="p-3">Subject</th><th>Organisation</th><th>Category</th><th>Priority</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {r.data.map((t) => (
                <tr key={t.id} className="border-t border-line">
                  <td className="p-3">
                    <Link href={`/hub/support/${t.id}`} className="font-medium hover:text-accent">{t.subject}</Link>
                    <p className="text-xs text-ink-3">{t.createdByName} · {t.messageCount} msg{t.lastSide === 'client' && t.status !== 'closed' ? ' · awaiting Azentio' : ''}</p>
                  </td>
                  <td>{t.orgName}</td>
                  <td className="text-ink-2">{CATEGORY_LABELS[t.category as keyof typeof CATEGORY_LABELS]}</td>
                  <td><span className={cx('chip', t.priority === 'high' && 'border-coral/40 text-coral')}>{t.priority}</span></td>
                  <td><TicketStatusPill status={t.status} /></td>
                  <td className="font-mono text-xs text-ink-3">{fmtDateTime(t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
