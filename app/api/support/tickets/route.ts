import { route, readJson, json, principal } from '@/lib/api';
import { createTicket, listTicketsForClient } from '@/lib/services/support';

export const GET = route(async () => json({ tickets: await listTicketsForClient(await principal()) }));
export const POST = route(async (req: Request) => json(await createTicket(await principal(), await readJson(req)), { status: 201 }));
