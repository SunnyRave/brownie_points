import { route, readJson, json, principal, type Params } from '@/lib/api';
import { decideModel } from '@/lib/federated/service';

/** Human review decision: approve | reject | deploy | rollback (note required). */
export const POST = route(async (req: Request, { params }: Params<'id'>) => json(await decideModel(await principal(), (await params).id, await readJson(req))));
