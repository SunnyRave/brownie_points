import { route, json, principal } from '@/lib/api';
import { communityFeed, FILTER_DIMENSIONS, type Filters } from '@/lib/insights';

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const filters: Filters = {};
  for (const d of FILTER_DIMENSIONS) {
    const v = sp.get(d.key);
    if (v) filters[d.key] = v.slice(0, 80);
  }
  return json(await communityFeed(await principal(), filters));
});
