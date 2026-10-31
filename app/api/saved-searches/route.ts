import { route, readJson, json, principal } from '@/lib/api';
import { createSavedSearch, listSavedSearches } from '@/lib/services/engagement';

export const GET = route(async () => json({ searches: await listSavedSearches(await principal()) }));
export const POST = route(async (req: Request) => json(await createSavedSearch(await principal(), await readJson(req)), { status: 201 }));
