import { route, readJson, json, principal } from '@/lib/api';
import { runRound } from '@/lib/federated/service';

export const POST = route(async (req: Request) => json(await runRound(await principal(), await readJson(req)), { status: 201 }));
