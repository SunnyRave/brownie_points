import { Denied, PageHeader, StatePill } from '@/components/ui';
import { requirePrincipal, guarded } from '@/lib/page';
import { supportView } from '@/lib/services/admin';
import { STATE_LABELS, type ObservationState } from '@/lib/learning/stateMachine';

export default async function Support({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const p = await requirePrincipal();
  const r = await guarded(() => supportView(p, orgId));
  if (!r.ok) return <Denied status={r.status} message="Viewing a client's records requires an active, time-boxed support_access grant for that organisation." />;
  return (
    <>
      <PageHeader eyebrow="Support access · audited" title="Client records (support view)" description="Read-only. Drafts and private records are never included. This view was recorded in the audit log." />
      <ul className="grid gap-3">{r.data.map((o) => <li key={o.id} className="panel-solid p-4"><StatePill state={o.state} label={STATE_LABELS[o.state as ObservationState]} /><p className="mt-2 font-semibold">{o.title}</p></li>)}</ul>
    </>
  );
}
