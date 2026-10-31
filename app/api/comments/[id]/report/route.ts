import { route, readJson, json, principal, type Params } from '@/lib/api';
import { reportComment } from '@/lib/services/comments';

export const POST = route(async (req: Request, { params }: Params<'id'>) => json(await reportComment(await principal(), (await params).id, await readJson(req))));
