import { revalidatePath } from 'next/cache';
import { route, readJson, json, principal } from '@/lib/api';
import { updateBanner } from '@/lib/services/content';

export const PUT = route(async (req: Request) => {
  await updateBanner(await principal(), await readJson(req));
  revalidatePath('/');
  return json({ ok: true });
});
