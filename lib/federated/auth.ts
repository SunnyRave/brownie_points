import { createHmac, timingSafeEqual } from 'node:crypto';
import { sign } from '@/lib/crypto';
import { canonical } from './model';
import type { ModelUpdate, SignedUpdate } from './types';

/**
 * SIMULATED participant authentication: each participant's HMAC key is derived server-side from
 * AUTH_SECRET + keyId and "provisioned" to its runtime. In production each client environment would hold
 * its own key/cert (mTLS or attested workload identity) that the coordinator never derives itself.
 */
export const participantSecret = (keyId: string) => sign(`fl-participant:${keyId}`);

const mac = (secret: string, u: ModelUpdate) => createHmac('sha256', secret).update(canonical(u)).digest('base64url');

export function signUpdate(secret: string, u: ModelUpdate): SignedUpdate {
  return { ...u, signature: mac(secret, u) };
}

export function verifyUpdate(u: SignedUpdate): boolean {
  if (typeof u.signature !== 'string') return false;
  const { signature, ...body } = u;
  const expected = Buffer.from(mac(participantSecret(u.participantKeyId), body));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
