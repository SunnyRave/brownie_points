import { route, readJson, json, principal, type Params } from '@/lib/api';
import { updateLeadStatus } from '@/lib/services/enquiries';

export const POST = route(async (req: Request, { params }: Params<'id'>) => json(await updateLeadStatus(await principal(), (await params).id, await readJson(req))));
