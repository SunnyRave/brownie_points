import { route, readJson, json, principal, type Params } from '@/lib/api';
import { deleteDraft, getObservation, updateObservation } from '@/lib/services/observations';

export const GET = route(async (_req: Request, { params }: Params<'id'>) => json(await getObservation(await principal(), (await params).id)));
export const PATCH = route(async (req: Request, { params }: Params<'id'>) => json(await updateObservation(await principal(), (await params).id, await readJson(req))));
export const DELETE = route(async (_req: Request, { params }: Params<'id'>) => {
  await deleteDraft(await principal(), (await params).id);
  return json({ ok: true });
});
