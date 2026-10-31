import Link from 'next/link';
import { Denied, EmptyState, PageHeader, PrivateLabel, fmtDateTime } from '@/components/ui';
import { NewTicketForm } from '@/components/support/NewTicketForm';
import { TicketStatusPill } from '@/components/support/TicketThread';
import { CATEGORY_LABELS } from '@/components/support/labels';
import { requirePrincipal, guarded } from '@/lib/page';
import { listTicketsForClient } from '@/lib/services/support';

export default async function SupportTickets({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const p = await requirePrincipal();
  const r = await guarded(() => listTicketsForClient(p));
  if (!r.ok) return <Denied status={r.status} message={r.message} />;
  const base = `/w/${orgSlug}`;
  const open = r.data.filter((t) => t.status !== 'closed' && t.status !== 'resolved');
  return (
    <>
      <PageHeader
        eyebrow="Client support"
        title="Support tickets"
        description={<span className="flex flex-wrap items-center gap-2">Ask Azentio for help with access, sandboxes, products or contributions. <PrivateLabel text="Private to your organisation + Azentio support" /></span>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <section className="space-y-3">
          <div className="panel-deep p-4 text-sm text-ink-2">
            <p>Tickets go to <strong>Azentio support</strong>. Everyone in your organisation can see your organisation’s tickets; other organisations never can. Tickets are never shared to the community, search or AIRA.</p>
            <p className="mt-2 text-ink-3">Please don’t include customer account numbers, card numbers or customer names. Support can see this ticket thread only — not your private observations.</p>
          </div>
          <h2 className="pt-2 font-semibold">{open.length} open · {r.data.length} total</h2>
          {r.data.length === 0 ? (
            <EmptyState title="No tickets yet" body="When you raise a ticket it appears here with its status and replies." />
          ) : (
            <ul className="space-y-3">
              {r.data.map((t) => (
                <li key={t.id}>
                  <Link href={`${base}/support/${t.id}`} className="panel-solid block p-4 transition hover:border-accent/50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{t.subject}</span>
                      <TicketStatusPill status={t.status} />
                    </div>
                    <p className="mt-1 text-xs text-ink-3">
                      {CATEGORY_LABELS[t.category as keyof typeof CATEGORY_LABELS]} · {t.priority} priority · raised by {t.createdByName ?? 'a colleague'} · {t.messageCount} message{t.messageCount === 1 ? '' : 's'} · updated {fmtDateTime(t.updatedAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside><NewTicketForm base={base} /></aside>
      </div>
    </>
  );
}
