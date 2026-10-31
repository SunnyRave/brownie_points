import { route, json, principal, type Params } from '@/lib/api';
import { attachmentResponse, deleteAttachment, downloadAttachment } from '@/lib/services/attachments';

/** Client download: re-checks the parent observation's visibility on every request. */
export const GET = route(async (_req: Request, { params }: Params<'id'>) => attachmentResponse(await downloadAttachment(await principal(), (await params).id)));
export const DELETE = route(async (_req: Request, { params }: Params<'id'>) => json(await deleteAttachment(await principal(), (await params).id)));
