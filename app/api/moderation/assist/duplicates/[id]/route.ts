import { route, json, principal, type Params } from '@/lib/api';
import { findPossibleDuplicates } from '@/lib/insights/assist';

/** Possible duplicates for one item under review (moderators only; lexical similarity). */
export const GET = route(async (_req: Request, { params }: Params<'id'>) => {
  const { id } = await params;
  return json(await findPossibleDuplicates(await principal(), id));
});
