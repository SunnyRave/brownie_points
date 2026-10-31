import { route, json, principal } from '@/lib/api';
import { getProgramme } from '@/lib/federated/service';

export const GET = route(async () => json(await getProgramme(await principal())));
