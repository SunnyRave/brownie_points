import { route, readJson, json, principal, type Params } from '@/lib/api';
import { decideAccessRequest } from '@/lib/services/admin';

export const POST = route(async (req: Request, { params }: Params<'id'>) => {
  await decideAccessRequest(await principal(), (await params).id, await readJson(req));
  return json({ ok: true });
});
