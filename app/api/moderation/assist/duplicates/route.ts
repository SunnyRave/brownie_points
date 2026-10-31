import { route, json, principal } from '@/lib/api';
import { queueDuplicateOverview } from '@/lib/insights/assist';

/** Every moderator-visible queue item with its top possible duplicate. */
export const GET = route(async () => json(await queueDuplicateOverview(await principal())));
