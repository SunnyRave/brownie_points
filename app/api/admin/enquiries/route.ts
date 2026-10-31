import { route, json, principal } from '@/lib/api';
import { listEnquiries } from '@/lib/services/enquiries';

export const GET = route(async () => json(await listEnquiries(await principal())));
