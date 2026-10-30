import { route, readJson, json, principal } from '@/lib/api';
import { listBroadcasts, upsertBroadcast } from '@/lib/services/content';

export const GET = route(async () => json({ items: (await listBroadcasts(await principal())).map(({ audience, ...b }) => ({ ...b, audienceKind: audience?.kind })) }));
export const POST = route(async (req: Request) => json(await upsertBroadcast(await principal(), null, await readJson(req)), { status: 201 }));
