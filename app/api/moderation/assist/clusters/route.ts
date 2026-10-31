import { route, json, principal } from '@/lib/api';
import { suggestClusters } from '@/lib/insights/assist';

/** Cluster suggestions over published shared copies only (moderators). */
export const GET = route(async () => json(await suggestClusters(await principal())));
