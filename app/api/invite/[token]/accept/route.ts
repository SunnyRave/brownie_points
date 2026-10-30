import { z } from 'zod';
import { route, readJson, json, principal, type Params } from '@/lib/api';
import { acceptInvitation } from '@/lib/auth/invitations';
import { HttpError } from '@/lib/http';

export const POST = route(async (req: Request, { params }: Params<'token'>) => {
  const { token } = await params;
  const p = await principal();
  if (!p) throw new HttpError(401, 'unauthenticated');
  const body = z.object({ terms: z.boolean(), sharingExplainer: z.boolean() }).parse(await readJson(req));
  const r = await acceptInvitation(p, token, body);
  if (!r.ok) throw new HttpError(403, r.code, r.message);
  return json(r);
});
