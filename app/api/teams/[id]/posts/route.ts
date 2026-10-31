import { route, readJson, json, principal, type Params } from '@/lib/api';
import { postToSpace } from '@/lib/services/teams';

export const POST = route(async (req: Request, { params }: Params<'id'>) => json(await postToSpace(await principal(), (await params).id, await readJson(req)), { status: 201 }));
