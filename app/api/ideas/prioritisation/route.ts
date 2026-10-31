import { route, json, principal } from '@/lib/api';
import { prioritisationAssist } from '@/lib/insights/assist';

/** Assistive, explainable theme ranking for product owners. Not a decision. */
export const GET = route(async () => json(await prioritisationAssist(await principal())));
