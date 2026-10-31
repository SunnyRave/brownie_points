import { route, readJson, json, principal, type Params } from '@/lib/api';
import { replyAsAgent } from '@/lib/services/support';

export const POST = route(async (req: Request, { params }: Params<'id'>) => json(await replyAsAgent(await principal(), (await params).id, await readJson(req)), { status: 201 }));
