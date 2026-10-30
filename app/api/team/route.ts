import { route, json, principal } from '@/lib/api';
import { listTeam } from '@/lib/auth/invitations';

export const GET = route(async () => json(await listTeam(await principal())));
