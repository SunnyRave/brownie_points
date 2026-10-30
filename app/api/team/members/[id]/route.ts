import { route, readJson, json, principal, type Params } from '@/lib/api';
import { changeMemberRole, revokeMember } from '@/lib/auth/invitations';
import { roleChangeSchema } from '@/lib/validation';

export const PATCH = route(async (req: Request, { params }: Params<'id'>) => {
  await changeMemberRole(await principal(), (await params).id, roleChangeSchema.parse(await readJson(req)).role);
  return json({ ok: true });
});
export const DELETE = route(async (_req: Request, { params }: Params<'id'>) => {
  await revokeMember(await principal(), (await params).id);
  return json({ ok: true });
});
