import Link from 'next/link';
import { Denied, PageHeader, fmtDateTime } from '@/components/ui';
import { DeskStatusSelect, ReplyBox } from '@/components/support/ReplyBox';
import { TicketStatusPill, TicketThread } from '@/components/support/TicketThread';
import { CATEGORY_LABELS, type TicketStatus } from '@/components/support/labels';
import { requirePrincipal, guarded } from '@/lib/page';
import { getDeskTicket } from '@/lib/services/support';

export default async function DeskTicket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requirePrincipal(`/hub/support/${id}`);
  const r = await guarded(() => getDeskTicket(p, id));
  if (!r.ok) return <Denied status={r.status} message={r.status === 404 ? 'Ticket not found.' : 'The client support desk requires an explicit support-agent authorisation.'} />;
  const { ticket: t, messages } = r.data;
  return (
    <>
      <PageHeader
        eyebrow={`${t.orgName} · ${CATEGORY_LABELS[t.category as keyof typeof CATEGORY_LABELS]}`}
        title={t.subject}
        description={<span className="flex flex-wrap items-center gap-2"><TicketStatusPill status={t.status} /><span className="chip">{t.priority} priority</span><span className="chip">raised by {t.createdByName} · {fmtDateTime(t.createdAt)}</span></span>}
        actions={<Link className="btn btn-ghost" href="/hub/support">Back to desk</Link>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <TicketThread messages={messages} viewer="azentio" />
          <ReplyBox ticketId={t.id} side="azentio" status={t.status as TicketStatus} />
        </div>
        <aside className="space-y-4">
          <section className="panel-solid p-5"><DeskStatusSelect ticketId={t.id} status={t.status as TicketStatus} /></section>
          <section className="panel-deep p-5 text-xs text-ink-3">
            This ticket is private to {t.orgName} and the support desk. It does not grant access to the organisation’s observations or other private content; that needs a separate, time-boxed support-access grant from a portal administrator.
          </section>
        </aside>
      </div>
    </>
  );
}
