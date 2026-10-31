import { route, json, principal } from '@/lib/api';
import { listDeskTickets } from '@/lib/services/support';

export const GET = route(async (req: Request) => json({ tickets: await listDeskTickets(await principal(), { status: new URL(req.url).searchParams.get('status') ?? undefined }) }));
