import { redirect } from 'next/navigation';
import { requirePrincipal } from '@/lib/page';
import { isEmployee } from '@/lib/policy/authorize';

export const dynamic = 'force-dynamic';

/** Canonical link for a shared insight (used by search/AIRA citations); opens it in the caller's own space. */
export default async function SharedInsightLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requirePrincipal(`/community/${id}`);
  const m = p.memberships.find((x) => x.orgId === p.activeTenantId && x.orgType === 'client');
  if (m) redirect(`/w/${m.orgSlug}/community?item=${encodeURIComponent(id)}#item-${id}`);
  if (isEmployee(p)) redirect(`/hub/community?item=${encodeURIComponent(id)}#item-${id}`);
  redirect('/portal');
}
