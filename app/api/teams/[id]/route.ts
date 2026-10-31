import { route, readJson, json, principal, type Params } from '@/lib/api';
import { getSpace, setSpaceStatus } from '@/lib/services/teams';

export const GET = route(async (_req: Request, { params }: Params<'id'>) => json(await getSpace(await principal(), (await params).id)));
export const PATCH = route(async (req: Request, { params }: Params<'id'>) => json(await setSpaceStatus(await principal(), (await params).id, await readJson(req))));
