import { route, json, principal } from '@/lib/api';
import { listQueue } from '@/lib/services/moderation';

export const GET = route(async () => json({ items: await listQueue(await principal()) }));
