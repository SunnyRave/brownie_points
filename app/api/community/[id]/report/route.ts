import { route, readJson, json, principal, type Params } from '@/lib/api';
import { reportSharedInsight } from '@/lib/services/moderation';

export const POST = route(async (req: Request, { params }: Params<'id'>) => json(await reportSharedInsight(await principal(), (await params).id, await readJson(req))));
