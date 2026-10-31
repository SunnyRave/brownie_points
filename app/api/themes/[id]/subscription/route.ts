import { route, json, principal, type Params } from '@/lib/api';
import { subscribeTheme, unsubscribeTheme } from '@/lib/services/engagement';

export const POST = route(async (_req: Request, { params }: Params<'id'>) => json(await subscribeTheme(await principal(), (await params).id)));
export const DELETE = route(async (_req: Request, { params }: Params<'id'>) => json(await unsubscribeTheme(await principal(), (await params).id)));
