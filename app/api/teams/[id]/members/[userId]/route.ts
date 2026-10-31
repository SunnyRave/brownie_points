import { route, json, principal, type Params } from '@/lib/api';
import { removeMember } from '@/lib/services/teams';

export const DELETE = route(async (_req: Request, { params }: Params<'id' | 'userId'>) => {
  const { id, userId } = await params;
  return json(await removeMember(await principal(), id, userId));
});
