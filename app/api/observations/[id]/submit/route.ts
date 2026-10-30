import { route, readJson, json, principal, type Params } from '@/lib/api';
import { submitObservation } from '@/lib/services/observations';

export const POST = route(async (req: Request, { params }: Params<'id'>) => json(await submitObservation(await principal(), (await params).id, await readJson(req))));
