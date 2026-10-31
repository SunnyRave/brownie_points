import { route, json, principal, type Params } from '@/lib/api';
import { badRequest, HttpError } from '@/lib/http';
import { ATTACHMENT_MAX_BYTES, listAttachments, uploadAttachment } from '@/lib/services/attachments';

export const GET = route(async (_req: Request, { params }: Params<'id'>) => json(await listAttachments(await principal(), (await params).id)));

/** multipart/form-data with one `file` field. Size is checked before and after parsing; type is sniffed from bytes. */
export const POST = route(async (req: Request, { params }: Params<'id'>) => {
  const p = await principal();
  const id = (await params).id;
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > ATTACHMENT_MAX_BYTES + 64 * 1024) throw new HttpError(413, 'attachment_too_large', `Attachments are limited to ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB.`);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest('invalid_multipart');
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') throw badRequest('file_required');
  if (file.size > ATTACHMENT_MAX_BYTES) throw new HttpError(413, 'attachment_too_large', `Attachments are limited to ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return json(await uploadAttachment(p, id, { filename: file.name, bytes }), { status: 201 });
});
