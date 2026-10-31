import { route, json, principal, type Params } from '@/lib/api';
import { adminCancelRegistration } from '@/lib/services/enquiries';

export const DELETE = route(async (_req: Request, { params }: Params<'id'>) => json(await adminCancelRegistration(await principal(), (await params).id)));
