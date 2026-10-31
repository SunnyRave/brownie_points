import Link from 'next/link';
import { Denied, PageHeader, PrivateLabel, fmtDateTime } from '@/components/ui';
import { FlagNotice } from '@/components/support/NewTicketForm';
import { ReplyBox } from '@/components/support/ReplyBox';
import { TicketStatusPill, TicketThread } from '@/components/support/TicketThread';
import { CATEGORY_LABELS, type TicketStatus } from '@/components/support/labels';
import { requirePrincipal, guarded } from '@/lib/page';
import { getTicketForClient } from '@/lib/services/support';

export default async function SupportTicket({ params, searchParams }: { params: Promise<{ orgSlug: string; id: string }>; searchParams: Promise<{ flagged?: string }> }) {
  const { orgSlug, id } = await params;
  const sp = await searchParams;
  const p = await requirePrincipal();
  const r = await guarded(() => getTicketForClient(p, id));
  if (!r.ok) return <Denied status={r.status} message={r.status === 404 ? 'This ticket doesn’t exist in your active workspace.' : r.message} />;
  const { ticket: t, messages } = r.data;
  return (
    <>
      <PageHeader
        eyebrow={`Support · ${CATEGORY_LABELS[t.category as keyof typeof CATEGORY_LABELS]}`}
        title={t.subject}
        description={<span className="flex flex-wrap items-center gap-2"><TicketStatusPill status={t.status} /><span className="chip">{t.priority} priority</span><PrivateLabel text="Your organisation + Azentio support" /></span>}
        actions={<Link className="btn btn-ghost" href={`/w/${orgSlug}/support`}>All tickets</Link>}
      />
      <div className="mx-auto max-w-3xl space-y-6">
        <FlagNotice flags={(sp.flagged ?? '').split(',').filter(Boolean)} />
        <p className="text-xs text-ink-3">Raised by {t.createdByName ?? 'a colleague'} · {fmtDateTime(t.createdAt)}</p>
        <TicketThread messages={messages} viewer="client" />
        <ReplyBox ticketId={t.id} side="client" status={t.status as TicketStatus} />
      </div>
    </>
  );
}
