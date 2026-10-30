import { route, readJson, json, principal, type Params } from '@/lib/api';
import { getIdeaForOwner, updateIdeaStatus } from '@/lib/services/ideas';

export const GET = route(async (_req: Request, { params }: Params<'id'>) => json(await getIdeaForOwner(await principal(), (await params).id)));
export const PATCH = route(async (req: Request, { params }: Params<'id'>) => json(await updateIdeaStatus(await principal(), (await params).id, await readJson(req))));
