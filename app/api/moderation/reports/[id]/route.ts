import { revalidatePath } from 'next/cache';
import { route, readJson, json, principal, type Params } from '@/lib/api';
import { decideReport } from '@/lib/services/moderation';

export const POST = route(async (req: Request, { params }: Params<'id'>) => {
  const r = await decideReport(await principal(), (await params).id, await readJson(req));
  revalidatePath('/', 'layout');
  return json(r);
});
