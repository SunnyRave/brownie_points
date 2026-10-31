import { route, readJson, json, principal, type Params } from '@/lib/api';
import { badRequest } from '@/lib/http';
import { closeTicketAsClient, getTicketForClient } from '@/lib/services/support';

export const GET = route(async (_req: Request, { params }: Params<'id'>) => json(await getTicketForClient(await principal(), (await params).id)));
/** Clients can only close their organisation's ticket; every other status is set by the support desk. */
export const PATCH = route(async (req: Request, { params }: Params<'id'>) => {
  const body = (await readJson(req)) as { action?: string };
  if (body?.action !== 'close') throw badRequest('unsupported_action');
  return json(await closeTicketAsClient(await principal(), (await params).id));
});
