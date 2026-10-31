import { route, readJson, json, principal, type Params } from '@/lib/api';
import { clearFeedback, setFeedback } from '@/lib/services/engagement';

/** "Useful" / "Needs evidence" — one vote per user per item; POST replaces, DELETE clears. */
export const POST = route(async (req: Request, { params }: Params<'id'>) => json(await setFeedback(await principal(), (await params).id, await readJson(req))));
export const DELETE = route(async (_req: Request, { params }: Params<'id'>) => json(await clearFeedback(await principal(), (await params).id)));
