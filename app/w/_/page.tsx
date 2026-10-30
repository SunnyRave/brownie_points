import { redirect } from 'next/navigation';
import { requirePrincipal } from '@/lib/page';

export const dynamic = 'force-dynamic';
/** `/w/_/…` resolves to the session's active workspace (used in notification links). */
export default async function ActiveWorkspace() {
  const p = await requirePrincipal();
  const m = p.memberships.find((x) => x.orgId === p.activeTenantId);
  redirect(m ? `/w/${m.orgSlug}` : '/portal');
}
