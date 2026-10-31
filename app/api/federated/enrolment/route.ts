import { route, readJson, json, principal } from '@/lib/api';
import { enrol, getMyEnrolment, withdraw } from '@/lib/federated/service';

/** Client admins: their own organisation's federated-programme consent (active tenant from the session). */
export const GET = route(async () => json(await getMyEnrolment(await principal())));
export const POST = route(async (req: Request) => json(await enrol(await principal(), await readJson(req)), { status: 201 }));
export const DELETE = route(async () => json(await withdraw(await principal())));
