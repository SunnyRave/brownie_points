import { route, readJson, json, principal, type Params } from '@/lib/api';
import { createComment, listComments } from '@/lib/services/comments';

export const GET = route(async (_req: Request, { params }: Params<'id'>) => json({ comments: await listComments(await principal(), (await params).id) }));
export const POST = route(async (req: Request, { params }: Params<'id'>) => json(await createComment(await principal(), (await params).id, await readJson(req)), { status: 201 }));
