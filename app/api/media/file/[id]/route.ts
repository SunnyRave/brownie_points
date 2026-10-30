import { route, type Params } from '@/lib/api';
import { readSignedMedia } from '@/lib/services/content';

export const GET = route(async (req: Request, { params }: Params<'id'>) => {
  const sp = new URL(req.url).searchParams;
  const { body, contentType } = await readSignedMedia((await params).id, sp.get('exp'), sp.get('sig'));
  return new Response(new Uint8Array(body), {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", 'X-Content-Type-Options': 'nosniff' },
  });
});
