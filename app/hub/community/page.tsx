import { CommunityView } from '@/components/community/CommunityView';
import { requirePrincipal } from '@/lib/page';

export default async function HubCommunity({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const p = await requirePrincipal();
  return <CommunityView principal={p} focus={(await searchParams).item} />;
}
