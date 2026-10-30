import { describe, expect, it } from 'vitest';
import { expectedIssuer, validateEntraClaims } from '@/lib/auth/entra';

const TID = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-8888-7777-6666-555555555555';
const base = { tid: TID, iss: expectedIssuer(TID), oid: 'oid-123', email: 'a@azentio.com', nonce: 'n1' };

describe('Entra ID claim validation', () => {
  it('accepts the Azentio tenant and keys on oid', () => {
    expect(validateEntraClaims(base, { tenantId: TID, nonce: 'n1' })).toEqual({ ok: true, oid: 'oid-123', email: 'a@azentio.com', name: 'a@azentio.com' });
  });
  it('AT-18: rejects a token from a different tenant (tid mismatch)', () => {
    expect(validateEntraClaims({ ...base, tid: OTHER, iss: expectedIssuer(OTHER) }, { tenantId: TID, nonce: 'n1' })).toEqual({ ok: false, reason: 'tenant_mismatch' });
  });
  it('rejects a matching tid with a foreign issuer', () => {
    expect(validateEntraClaims({ ...base, iss: expectedIssuer(OTHER) }, { tenantId: TID, nonce: 'n1' })).toEqual({ ok: false, reason: 'issuer_mismatch' });
  });
  it('rejects nonce replay and missing oid; email alone is never enough', () => {
    expect(validateEntraClaims(base, { tenantId: TID, nonce: 'other' })).toMatchObject({ ok: false, reason: 'nonce_mismatch' });
    expect(validateEntraClaims({ ...base, oid: undefined }, { tenantId: TID, nonce: 'n1' })).toMatchObject({ ok: false, reason: 'missing_oid' });
  });
  it('fails closed when the tenant is not configured', () => {
    expect(validateEntraClaims(base, { tenantId: '' })).toMatchObject({ ok: false, reason: 'tenant_not_configured' });
  });
});
