import { z } from 'zod';
import { route, readJson, json, principal } from '@/lib/api';
import { setActiveTenant } from '@/lib/auth/session';
import { HttpError, forbidden } from '@/lib/http';

/** IAM-03/09: the active workspace lives in the server session; switching requires an active membership. */
export const POST = route(async (req: Request) => {
  const p = await principal();
  if (!p) throw new HttpError(401, 'unauthenticated');
  const { orgId } = z.object({ orgId: z.string().max(64) }).parse(await readJson(req));
  if (!(await setActiveTenant(p, orgId))) throw forbidden('not_a_member');
  const org = p.memberships.find((m) => m.orgId === orgId)!;
  return json({ ok: true, orgSlug: org.orgSlug, orgType: org.orgType });
});
