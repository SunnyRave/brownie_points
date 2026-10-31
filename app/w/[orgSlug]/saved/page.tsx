import { Denied } from '@/components/ui';
import { SavedView } from '@/components/community/SavedView';
import { requirePrincipal, guarded } from '@/lib/page';
import { enforce } from '@/lib/policy/enforce';
import { communityResource } from '@/lib/insights';

export default async function WorkspaceSaved({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const p = await requirePrincipal(`/w/${orgSlug}/saved`);
  const r = await guarded(() => enforce(p, 'read', communityResource));
  if (!r.ok) return <Denied status={r.status} />;
  return <div data-persona="client"><SavedView principal={p} communityHref={`/w/${orgSlug}/community`} /></div>;
}
