import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET is required in production');
  return s ?? 'dev-only-insecure-secret';
};

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** Tokens (sessions, invitations, magic links) are stored only as a keyed hash. */
export const hashToken = (token: string) => createHmac('sha256', secret()).update(token).digest('hex');

export const sha256b64url = (input: string) => createHash('sha256').update(input).digest('base64url');

export function sign(value: string) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

export function verifySignature(value: string, signature: string) {
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
