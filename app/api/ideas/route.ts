import { route, readJson, json, principal } from '@/lib/api';
import { createIdea, listPublicIdeas } from '@/lib/services/ideas';

export const GET = route(async () => json({ items: await listPublicIdeas(await principal()) }));
export const POST = route(async (req: Request) => json(await createIdea(await principal(), await readJson(req)), { status: 201 }));
