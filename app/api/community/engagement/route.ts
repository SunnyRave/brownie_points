import { route, json, principal } from '@/lib/api';
import { engagementFor } from '@/lib/services/engagement';
import { commentCounts } from '@/lib/services/comments';

/** Feed-card state for the caller: per-item feedback totals, own vote, bookmark flag, visible comment count. */
export const GET = route(async (req: Request) => {
  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 200);
  const p = await principal();
  const state = await engagementFor(p, ids);
  const counts = await commentCounts(p, Object.keys(state));
  return json(Object.fromEntries(Object.entries(state).map(([id, s]) => [id, { ...s, comments: counts[id] ?? 0 }])));
});
