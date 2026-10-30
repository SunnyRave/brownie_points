import { z } from 'zod';
import { route, readJson, json, principal } from '@/lib/api';
import { runScenario } from '@/lib/services/playground';

export const POST = route(async (req: Request) => {
  const body = z.object({ context: z.enum(['employee', 'client']) }).passthrough().parse(await readJson(req));
  return json(await runScenario(await principal(), body.context, body));
});
