import { route, readJson, json } from '@/lib/api';
import { cancelRegistration } from '@/lib/services/public-forms';

/** The signed token from the confirmation email is the only credential; no sign-in needed. */
export const POST = route(async (req: Request) => json(await cancelRegistration(await readJson(req))));
