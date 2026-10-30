import { route, json, principal, type Params } from '@/lib/api';
import { revokeInvitation } from '@/lib/auth/invitations';

export const DELETE = route(async (_req: Request, { params }: Params<'id'>) => {
  await revokeInvitation(await principal(), (await params).id);
  return json({ ok: true });
});
