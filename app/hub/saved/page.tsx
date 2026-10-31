import { Denied } from '@/components/ui';
import { SavedView } from '@/components/community/SavedView';
import { requirePrincipal, guarded } from '@/lib/page';
import { enforce } from '@/lib/policy/enforce';
import { communityResource } from '@/lib/insights';

export default async function HubSaved() {
  const p = await requirePrincipal('/hub/saved');
  const r = await guarded(() => enforce(p, 'read', communityResource));
  if (!r.ok) return <Denied status={r.status} />;
  return <SavedView principal={p} communityHref="/hub/community" />;
}
