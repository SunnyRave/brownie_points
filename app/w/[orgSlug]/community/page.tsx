import { Denied } from '@/components/ui';
import { CommunityView } from '@/components/community/CommunityView';
import { requirePrincipal, guarded } from '@/lib/page';
import { enforce } from '@/lib/policy/enforce';
import { communityResource } from '@/lib/insights';

export default async function Community({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const p = await requirePrincipal();
  const r = await guarded(() => enforce(p, 'read', communityResource));
  if (!r.ok) return <Denied status={r.status} />;
  return <div data-persona="client"><CommunityView principal={p} focus={(await searchParams).item} /></div>;
}
