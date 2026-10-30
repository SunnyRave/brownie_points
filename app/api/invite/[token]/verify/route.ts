import { eq } from 'drizzle-orm';
import { route, json, clientKey, type Params } from '@/lib/api';
import { schema, withSystemTx } from '@/lib/db';
import { hashToken } from '@/lib/crypto';
import { requestInviteVerification } from '@/lib/auth/magic';
import { isDemoMode } from '@/lib/settings';
import { HttpError } from '@/lib/http';

export const POST = route(async (req: Request, { params }: Params<'token'>) => {
  const { token } = await params;
  const r = await withSystemTx(async (tx) => {
    const [inv] = await tx.select().from(schema.invitations).where(eq(schema.invitations.tokenHash, hashToken(token))).limit(1);
    if (!inv || inv.status !== 'pending' || inv.expiresAt.getTime() < Date.now()) throw new HttpError(410, 'invitation_unavailable');
    return requestInviteVerification(tx, inv, token, clientKey(req));
  });
  return json({ status: 'queued', ...(isDemoMode() ? { devMailbox: `/dev/mailbox?key=${encodeURIComponent(r.outboxKey)}` } : {}) });
});
