import { revalidatePath } from 'next/cache';
import { route, readJson, json, principal, type Params } from '@/lib/api';
import { decideComment } from '@/lib/services/comments';

export const POST = route(async (req: Request, { params }: Params<'id'>) => {
  const r = await decideComment(await principal(), (await params).id, await readJson(req));
  revalidatePath('/moderate/comments');
  return json(r);
});
