import { route, readJson, json, principal } from '@/lib/api';
import { createDraft, listObservations } from '@/lib/services/observations';

// The tenant always comes from the server session. Any tenant header/param in the request is ignored.
export const GET = route(async (req: Request) => {
  const tab = new URL(req.url).searchParams.get('tab') === 'org' ? 'org' : 'mine';
  return json({ items: await listObservations(await principal(), tab) });
});
export const POST = route(async (req: Request) => json(await createDraft(await principal(), await readJson(req)), { status: 201 }));
