import { route, readJson, json, principal, type Params } from '@/lib/api';
import { recordFeedback } from '@/lib/services/playground';

export const POST = route(async (req: Request, { params }: Params<'id'>) => {
  await recordFeedback(await principal(), (await params).id, await readJson(req));
  return json({ ok: true });
});
