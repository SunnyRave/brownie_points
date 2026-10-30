import { route, readJson, json, principal, type Params } from '@/lib/api';
import * as admin from '@/lib/services/admin';
import { getDb } from '@/lib/db';
import { resetAndSeed } from '@/scripts/seed-data';
import { enforce } from '@/lib/policy/enforce';
import { isDemoMode } from '@/lib/settings';
import { notFound, HttpError } from '@/lib/http';
import { revalidatePath } from 'next/cache';

/** Every action calls into lib/services/admin, which enforces the portal_admin grant (and recent MFA for writes). */
export const GET = route(async (req: Request, { params }: Params<'action'>) => {
  const p = await principal();
  const { action } = await params;
  switch (action) {
    case 'overview': return json(await admin.overview(p));
    case 'grants': return json({ items: await admin.listGrants(p) });
    case 'people': return json(await admin.listPeople(p));
    case 'settings': return json(await admin.getSettings(p));
    case 'audit': {
      const d = new URL(req.url).searchParams.get('decision');
      return json({ items: await admin.listAudit(p, { decision: d === 'deny' || d === 'allow' ? d : undefined }) });
    }
    default: throw notFound();
  }
});

export const POST = route(async (req: Request, { params }: Params<'action'>) => {
  const p = await principal();
  const { action } = await params;
  const body = action === 'reset' ? {} : await readJson(req);
  switch (action) {
    case 'orgs': return json(await admin.createOrg(p, body), { status: 201 });
    case 'entitlements': await admin.setEntitlement(p, body); return json({ ok: true });
    case 'grants': return json(await admin.assignGrant(p, body), { status: 201 });
    case 'allowlist': await admin.addToAllowlist(p, body); return json({ ok: true });
    case 'settings': await admin.updateSettings(p, body); return json({ ok: true });
    case 'invite': return json(await admin.adminInvite(p, body), { status: 201 });
    case 'reset': {
      if (!isDemoMode()) throw new HttpError(404, 'not_found');
      await enforce(p, 'manage_grants', admin.adminResource);
      await resetAndSeed(await getDb());
      revalidatePath('/', 'layout');
      return json({ ok: true });
    }
    default: throw notFound();
  }
});
