import { route, json, principal } from '@/lib/api';
import { themeDashboard } from '@/lib/insights';

export const GET = route(async () => json(await themeDashboard(await principal())));
