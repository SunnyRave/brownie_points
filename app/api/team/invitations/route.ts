import { route, readJson, json, principal } from '@/lib/api';
import { createInvitation } from '@/lib/auth/invitations';
import { inviteSchema } from '@/lib/validation';

export const POST = route(async (req: Request) => json(await createInvitation(await principal(), inviteSchema.parse(await readJson(req))), { status: 201 }));
