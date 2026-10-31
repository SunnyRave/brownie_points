import { Denied } from '@/components/ui';
import { CommunityView } from '@/components/community/CommunityView';
import { requirePrincipal, guarded } from '@/lib/page';
import { enforce } from '@/lib/policy/enforce';
import { communityResource, FILTER_DIMENSIONS } from '@/lib/insights';

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v.slice(0, 200) : undefined);

export default async function Community({ searchParams }: { searchParams: SP }) {
  const p = await requirePrincipal();
  const r = await guarded(() => enforce(p, 'read', communityResource));
  if (!r.ok) return <Denied status={r.status} />;
  const sp = await searchParams;
  // Saved searches deep-link here; the server still drops any filter that would isolate < k organisations.
  const filters = Object.fromEntries(FILTER_DIMENSIONS.map((d) => [d.key, one(sp[d.key])?.slice(0, 80)]).filter(([, v]) => v)) as Record<string, string>;
  return <div data-persona="client"><CommunityView principal={p} focus={one(sp.item)} initial={{ query: one(sp.q), filters }} /></div>;
}
