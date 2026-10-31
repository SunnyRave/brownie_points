import { route, principal, type Params } from '@/lib/api';
import { attachmentResponse, downloadAttachmentForModerator } from '@/lib/services/attachments';

/** Moderator download: moderator grant + moderator-mode RLS (proposed-for-sharing, non-draft records only). */
export const GET = route(async (_req: Request, { params }: Params<'id'>) => attachmentResponse(await downloadAttachmentForModerator(await principal(), (await params).id)));
