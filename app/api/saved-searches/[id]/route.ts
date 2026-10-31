import { route, json, principal, type Params } from '@/lib/api';
import { deleteSavedSearch, runSavedSearch } from '@/lib/services/engagement';

/** GET re-runs the search under current visibility and k rules; results are never stored. */
export const GET = route(async (_req: Request, { params }: Params<'id'>) => json(await runSavedSearch(await principal(), (await params).id)));
export const DELETE = route(async (_req: Request, { params }: Params<'id'>) => json(await deleteSavedSearch(await principal(), (await params).id)));
