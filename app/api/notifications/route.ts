import { route, json, principal } from '@/lib/api';
import { listNotifications, markAllRead } from '@/lib/services/notifications';

export const GET = route(async () => json({ items: await listNotifications(await principal()) }));
export const POST = route(async () => {
  await markAllRead(await principal());
  return json({ ok: true });
});
