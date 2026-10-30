import { redirect } from 'next/navigation';
import { requirePrincipal } from '@/lib/page';

export const dynamic = 'force-dynamic';
export default async function ActiveWorkspaceDeep({ params }: { params: Promise<{ rest: string[] }> }) {
  const p = await requirePrincipal();
  const m = p.memberships.find((x) => x.orgId === p.activeTenantId);
  const rest = (await params).rest.map(encodeURIComponent).join('/');
  redirect(m ? `/w/${m.orgSlug}/${rest}` : '/portal');
}
