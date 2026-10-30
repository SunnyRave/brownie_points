import { route, json, principal, type Params } from '@/lib/api';
import { getSharedInsight } from '@/lib/insights';

export const GET = route(async (_req: Request, { params }: Params<'id'>) => json(await getSharedInsight(await principal(), (await params).id)));
