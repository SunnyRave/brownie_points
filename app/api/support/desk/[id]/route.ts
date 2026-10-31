import { route, readJson, json, principal, type Params } from '@/lib/api';
import { getDeskTicket, setTicketStatus } from '@/lib/services/support';

export const GET = route(async (_req: Request, { params }: Params<'id'>) => json(await getDeskTicket(await principal(), (await params).id)));
export const PATCH = route(async (req: Request, { params }: Params<'id'>) => json(await setTicketStatus(await principal(), (await params).id, await readJson(req))));
