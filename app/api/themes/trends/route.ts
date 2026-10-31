import { route, json, principal } from '@/lib/api';
import { themeTrendChanges } from '@/lib/insights/assist';

/** Differencing-safe trend-change summaries per theme (distinct organisations, never post counts). */
export const GET = route(async () => json(await themeTrendChanges(await principal())));
