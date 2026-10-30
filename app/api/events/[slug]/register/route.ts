import { route, readJson, json, principal, clientKey, type Params } from '@/lib/api';
import { registerForEvent } from '@/lib/services/public-forms';

export const POST = route(async (req: Request, { params }: Params<'slug'>) => json(await registerForEvent(await principal(), (await params).slug, await readJson(req), clientKey(req)), { status: 201 }));
