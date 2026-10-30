import { revalidatePath } from 'next/cache';
import { route, readJson, json, principal, type Params } from '@/lib/api';
import { decide, getReviewItem } from '@/lib/services/moderation';

export const GET = route(async (_req: Request, { params }: Params<'id'>) => json(await getReviewItem(await principal(), (await params).id)));
export const POST = route(async (req: Request, { params }: Params<'id'>) => {
  const r = await decide(await principal(), (await params).id, await readJson(req));
  revalidatePath('/', 'layout');
  return json(r);
});
