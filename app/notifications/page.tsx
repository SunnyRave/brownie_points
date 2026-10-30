import Link from 'next/link';
import { PortalShell } from '@/components/portal/PortalShell';
import { PageHeader, EmptyState, fmtDateTime } from '@/components/ui';
import { MarkAllRead } from '@/components/portal/MarkAllRead';
import { requirePrincipal } from '@/lib/page';
import { listNotifications, myEmailStatus } from '@/lib/services/notifications';
import { isEmployee } from '@/lib/policy/authorize';

export const dynamic = 'force-dynamic';

export default async function Notifications() {
  const p = await requirePrincipal('/notifications');
  const [items, emails] = await Promise.all([listNotifications(p), myEmailStatus(p)]);
  const client = p.memberships.find((m) => m.orgId === p.activeTenantId);
  const fixLink = (l: string | null) => (l && client ? l.replace('/w/_/', `/w/${client.orgSlug}/`) : l);
  return (
    <PortalShell principal={p} persona={client ? 'client' : 'employee'} activeLabel={client?.orgName ?? (isEmployee(p) ? 'Azentio' : '—')} nav={[{ href: '/portal', label: 'Back to portal' }, { href: '/notifications', label: 'Notifications' }]}>
      <PageHeader title="Notifications" description="In-app updates are stored and delivered here. Email copies show their true outbox status." actions={<MarkAllRead />} />
      {items.length === 0 ? <EmptyState title="Nothing yet" body="State changes on your contributions and ideas will appear here." /> : (
        <ul className="space-y-3">
          {items.map((n) => (
            <li key={n.id} className={`panel-solid p-5 ${n.readAt ? 'opacity-70' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{n.title}</p>
                  {n.body && <p className="mt-1 text-sm text-ink-2">{n.body}</p>}
                </div>
                <span className="shrink-0 font-mono text-xs text-muted">{fmtDateTime(n.createdAt)}</span>
              </div>
              {fixLink(n.link) && !fixLink(n.link)!.includes('/w/_/') && <Link href={fixLink(n.link)!} className="mt-3 inline-block text-sm text-accent underline-offset-4 hover:underline">Open</Link>}
            </li>
          ))}
        </ul>
      )}
      {emails.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Email to {p.email}</h2>
          <ul className="mt-3 space-y-2">
            {emails.map((e) => (
              <li key={e.id} className="panel-deep flex items-center justify-between p-4 text-sm">
                <span>{(e.payload as { subject: string }).subject}</span>
                <span className="chip">{e.status === 'queued' ? 'Queued — not yet sent' : e.status === 'sent' ? 'Sent to provider' : e.status === 'delivered' ? 'Delivered (provider confirmed)' : 'Failed'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PortalShell>
  );
}
