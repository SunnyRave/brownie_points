import { CommunityView } from '@/components/community/CommunityView';
import { requirePrincipal } from '@/lib/page';
import { FILTER_DIMENSIONS } from '@/lib/insights';

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v.slice(0, 200) : undefined);

export default async function HubCommunity({ searchParams }: { searchParams: SP }) {
  const p = await requirePrincipal();
  const sp = await searchParams;
  const filters = Object.fromEntries(FILTER_DIMENSIONS.map((d) => [d.key, one(sp[d.key])?.slice(0, 80)]).filter(([, v]) => v)) as Record<string, string>;
  return <CommunityView principal={p} focus={one(sp.item)} initial={{ query: one(sp.q), filters }} />;
}
