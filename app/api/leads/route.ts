import { route, readJson, json, principal, clientKey } from '@/lib/api';
import { submitLead } from '@/lib/services/public-forms';

export const POST = route(async (req: Request) => json(await submitLead(await principal(), await readJson(req), clientKey(req)), { status: 201 }));
