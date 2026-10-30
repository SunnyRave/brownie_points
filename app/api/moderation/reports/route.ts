import { route, json, principal } from '@/lib/api';
import { listReports } from '@/lib/services/moderation';

export const GET = route(async () => json({ items: await listReports(await principal()) }));
