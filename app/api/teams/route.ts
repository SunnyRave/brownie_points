import { route, readJson, json, principal } from '@/lib/api';
import { createSpace, listSpaces } from '@/lib/services/teams';

export const GET = route(async () => json({ spaces: await listSpaces(await principal()) }));
export const POST = route(async (req: Request) => json(await createSpace(await principal(), await readJson(req)), { status: 201 }));
