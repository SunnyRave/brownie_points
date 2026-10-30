import { route, json, principal, type Params } from '@/lib/api';
import { supportView } from '@/lib/services/admin';

export const GET = route(async (_req: Request, { params }: Params<'orgId'>) => json({ items: await supportView(await principal(), (await params).orgId) }));
