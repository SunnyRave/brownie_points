import { route, json, principal } from '@/lib/api';
import { search } from '@/lib/search';

export const GET = route(async (req: Request) => {
  const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, 200);
  const { results, count } = await search(await principal(), q);
  return json({ count, results: results.map(({ id, sourceType, title, snippet, url }) => ({ id, sourceType, title, snippet, url })) });
});
