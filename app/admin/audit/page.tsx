import Link from 'next/link';
import { PageHeader, fmtDateTime } from '@/components/ui';
import { requirePrincipal } from '@/lib/page';
import { listAudit } from '@/lib/services/admin';

export default async function Audit({ searchParams }: { searchParams: Promise<{ decision?: string }> }) {
  const d = (await searchParams).decision;
  const decision = d === 'deny' || d === 'allow' ? d : undefined;
  const p = await requirePrincipal();
  const items = await listAudit(p, { decision, limit: 200 });
  return (
    <>
      <PageHeader eyebrow="Administration" title="Audit log" description="Append-only: the application database role cannot update or delete audit events." />
      <nav className="mb-4 flex gap-2">{[['All', '/admin/audit'], ['Denials', '/admin/audit?decision=deny'], ['Allowed', '/admin/audit?decision=allow']].map(([l, h]) => <Link key={h} href={h} className={`chip min-h-9 px-4 ${(decision ?? 'All') === (l === 'Denials' ? 'deny' : l === 'Allowed' ? 'allow' : 'All') ? 'border-accent text-ink' : ''}`}>{l}</Link>)}</nav>
      <div className="panel-solid overflow-x-auto p-4">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-xs text-muted"><tr><th className="py-2">When</th><th>Actor</th><th>Action</th><th>Resource</th><th>Decision</th><th>Detail</th></tr></thead>
          <tbody>{items.map((e) => (
            <tr key={e.id} className="border-t border-line align-top">
              <td className="py-2 font-mono text-xs">{fmtDateTime(e.createdAt)}</td>
              <td className="text-xs">{e.actor ?? 'system / anonymous'}</td>
              <td className="font-mono text-xs">{e.action}</td>
              <td className="font-mono text-xs text-ink-3">{e.resourceType}{e.resourceId ? `:${e.resourceId.slice(0, 8)}` : ''}</td>
              <td><span className={`chip ${e.decision === 'deny' ? 'border-coral/50 text-coral' : 'border-teal/40 text-teal'}`}>{e.decision}</span></td>
              <td className="max-w-[260px] truncate font-mono text-[11px] text-muted" title={JSON.stringify(e.meta)}>{JSON.stringify(e.meta)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
