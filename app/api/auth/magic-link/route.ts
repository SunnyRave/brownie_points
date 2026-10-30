import { route, readJson, json, clientKey } from '@/lib/api';
import { requestSignInLink } from '@/lib/auth/magic';
import { magicLinkRequestSchema } from '@/lib/validation';
import { getAuthMethods, isDemoMode } from '@/lib/settings';
import { HttpError } from '@/lib/http';

/** Always answers "queued" (never "sent") and never reveals whether the account exists. */
export const POST = route(async (req: Request) => {
  if (!(await getAuthMethods()).includes('magiclink')) throw new HttpError(403, 'magiclink_disabled');
  const { email } = magicLinkRequestSchema.parse(await readJson(req));
  const r = await requestSignInLink(email, clientKey(req));
  return json({ status: 'queued', message: 'If this address can sign in, a link has been queued. It expires in 15 minutes.', ...(isDemoMode() && r.outboxKey ? { devMailbox: `/dev/mailbox?key=${encodeURIComponent(r.outboxKey)}` } : {}) });
});
