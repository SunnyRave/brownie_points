import { route, readJson, json, principal, type Params } from '@/lib/api';
import { getBroadcast, upsertBroadcast } from '@/lib/services/content';

export const GET = route(async (_req: Request, { params }: Params<'id'>) => {
  const { audience, ...b } = await getBroadcast(await principal(), (await params).id);
  return json({ ...b, audienceKind: audience?.kind });
});
export const PATCH = route(async (req: Request, { params }: Params<'id'>) => json(await upsertBroadcast(await principal(), (await params).id, await readJson(req))));
