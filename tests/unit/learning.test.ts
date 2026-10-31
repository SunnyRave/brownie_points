import { describe, expect, it } from 'vitest';
import { canTransition, nextState, TransitionError } from '@/lib/learning/stateMachine';
import { FORBIDDEN_SHARED_KEYS, toSharedInsightDTO } from '@/lib/learning/dto';
import { orgBand, sliceCheck } from '@/lib/insights';
import { scanSensitive, generalisePeriod, generaliseRegion, suggestRedaction } from '@/lib/scan';

describe('observation state machine', () => {
  it('allows the documented path and rejects everything else', () => {
    expect(nextState('draft', 'submit', 'author')).toBe('submitted');
    expect(nextState('submitted', 'claim', 'moderator')).toBe('in_review');
    expect(nextState('in_review', 'approve', 'moderator')).toBe('published');
    expect(nextState('published', 'withdraw', 'author')).toBe('withdrawn');
    expect(nextState('published', 'edit', 'author')).toBe('submitted');
    expect(() => nextState('draft', 'approve', 'moderator')).toThrow(TransitionError);
    expect(() => nextState('submitted', 'approve', 'moderator')).toThrow(TransitionError); // must be claimed
    expect(() => nextState('in_review', 'approve', 'author')).toThrow(TransitionError); // wrong actor
    expect(canTransition('draft', 'claim', 'moderator')).toBe(false); // moderators never touch drafts
    expect(nextState('draft', 'delete', 'author')).toBeNull();
  });
});

describe('shared insight DTO (AT-09, SHR-03)', () => {
  it('never contains tenant, author, attachment or reviewer fields', () => {
    const row = {
      id: 's1', sourceObservationId: 'obs-secret', sourceTenantId: 'tenant-secret', version: 2, type: 'trend', title: 'T', body: 'B',
      offeringId: 'o', industry: 'Banking', regionGeneralised: 'Europe', periodQuarter: '2026 Q1', topic: 'Seasonality', confidence: 'high',
      attributionOrgName: null, evidenceQuality: 'moderate' as const, status: 'published' as const, publishedAt: new Date(), withdrawnAt: null, updatedAt: new Date(),
    };
    const json = JSON.stringify(toSharedInsightDTO(row));
    const dto = JSON.parse(json);
    for (const k of FORBIDDEN_SHARED_KEYS) expect(dto).not.toHaveProperty(k);
    expect(json).not.toContain('obs-secret');
    expect(json).not.toContain('tenant-secret');
  });
});

describe('k-threshold aggregation (INS-02/03)', () => {
  const row = (tenant: string, topic: string, region = 'Europe') => ({ sourceTenantId: tenant, topic, regionGeneralised: region, offeringId: null, industry: null, periodQuarter: null }) as never;
  const all = [row('a', 'S'), row('a', 'S'), row('a', 'S'), row('b', 'S'), row('c', 'D'), row('d', 'D'), row('e', 'D'), row('f', 'D', 'Africa')];

  it('bands start at k and repeated posts from one org count once', () => {
    expect(orgBand(2, 3)).toBeNull();
    expect(orgBand(3, 3)).toBe('3–5');
    expect(orgBand(7, 3)).toBe('6–10');
    expect(orgBand(11, 3)).toBe('10+');
  });
  it('AT-13: a slice below k is disabled, as is one whose complement is below k', () => {
    expect(sliceCheck(all, { topic: 'S' }, 3).ok).toBe(false); // 2 orgs (5 posts) — below k
    expect(sliceCheck(all, { topic: 'D' }, 3).ok).toBe(false); // slice 4 orgs, complement 2 orgs → differencing risk
    expect(sliceCheck([...all, row('g', 'S')], { topic: 'D' }, 3).ok).toBe(true); // 4 vs 3
    expect(sliceCheck(all, { region: 'Africa' }, 3).ok).toBe(false);
    expect(sliceCheck(all, {}, 3).ok).toBe(true);
  });
});

describe('sensitive-content scan and generalisation', () => {
  it('flags (not blocks) likely sensitive content', () => {
    const flags = scanSensitive({ title: 'Brightwater Bakery issue', body: 'Account 44120987 and pricing in the contract; email x@y.example' });
    const kinds = flags.map((f) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining(['account_number', 'confidential_term', 'email', 'customer_name']));
  });
  it('generalises city → region and dates → quarter, and suggests redactions', () => {
    expect(generaliseRegion('Leeds')).toBe('Europe');
    expect(generalisePeriod('2026-01-15', '2026-03-02')).toBe('2026 Q1');
    expect(generalisePeriod('2026-03-01', '2026-04-15')).toBe('2026 Q1–Q2');
    expect(suggestRedaction('Coastal Freight Ltd in Dubai, acct 44120987')).toBe('[a customer] in [Middle East], acct [number]');
  });
});
