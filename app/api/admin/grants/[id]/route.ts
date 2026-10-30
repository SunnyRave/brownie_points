import { route, json, principal, type Params } from '@/lib/api';
import { revokeGrant } from '@/lib/services/admin';

export const DELETE = route(async (_req: Request, { params }: Params<'id'>) => {
  await revokeGrant(await principal(), (await params).id);
  return json({ ok: true });
});
