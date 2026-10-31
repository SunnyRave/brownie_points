import { route, json, principal } from '@/lib/api';
import { runDigests } from '@/lib/services/digests';

/** Portal admin only. In-app digests are delivered; emails are queued in the outbox (not "delivered"). */
export const POST = route(async (req: Request) => {
  const raw = await req.json().catch(() => ({}));
  return json(await runDigests(await principal(), raw));
});
