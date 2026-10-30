import { route, json, principal, type Params } from '@/lib/api';
import { mintMediaUrl } from '@/lib/services/content';

/** IAM-10: authorize() first, then a 5-minute signed URL. Files are never served from /public. */
export const GET = route(async (_req: Request, { params }: Params<'id'>) => json(await mintMediaUrl(await principal(), (await params).id)));
