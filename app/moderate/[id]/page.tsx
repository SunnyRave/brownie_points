import { Denied, PageHeader, StatePill } from '@/components/ui';
import { ReviewForm } from '@/components/moderation/ReviewForm';
import { requirePrincipal, guarded } from '@/lib/page';
import { getReviewItem } from '@/lib/services/moderation';
import { STATE_LABELS, type ObservationState } from '@/lib/learning/stateMachine';

export default async function Review({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requirePrincipal();
  const r = await guarded(() => getReviewItem(p, id));
  if (!r.ok) return <Denied status={r.status} />;
  const item = r.data;
  return (
    <>
      <PageHeader eyebrow="Review" title={item.original.title} description={<span className="flex flex-wrap items-center gap-2"><StatePill state={item.original.state} label={STATE_LABELS[item.original.state as ObservationState]} /><span className="chip">v{item.original.version}</span><span className="chip">{item.attributionOrg ? `Attribution requested: ${item.attributionOrg}` : 'Contributor organisation hidden (no attribution consent)'}</span></span>} />
      <ReviewForm id={id} item={item} />
    </>
  );
}
