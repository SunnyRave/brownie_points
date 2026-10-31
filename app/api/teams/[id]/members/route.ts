import { route, json, principal, type Params } from '@/lib/api';
import { joinSpace, leaveSpace } from '@/lib/services/teams';

/** POST joins the space as the signed-in employee; DELETE leaves it. */
export const POST = route(async (_req: Request, { params }: Params<'id'>) => json(await joinSpace(await principal(), (await params).id)));
export const DELETE = route(async (_req: Request, { params }: Params<'id'>) => json(await leaveSpace(await principal(), (await params).id)));
