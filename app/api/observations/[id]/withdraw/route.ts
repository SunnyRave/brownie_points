import { revalidatePath } from 'next/cache';
import { route, json, principal, type Params } from '@/lib/api';
import { withdrawObservation } from '@/lib/services/observations';

export const POST = route(async (_req: Request, { params }: Params<'id'>) => {
  const receipt = await withdrawObservation(await principal(), (await params).id);
  revalidatePath('/', 'layout'); // purge any cached render of feed/search/themes
  return json({ ...receipt, notice: 'Already viewed or copied material cannot be recalled automatically.' });
});
