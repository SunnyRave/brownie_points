import { describe, expect, it } from 'vitest';
import {
  agglomerate, buildTfIdf, clusterLabel, combinedScore, cosine, priorityScore, quarterKey, quarterLabel, sharedTerms, stem, strengthOf,
  tokenize, trendDirection, trigramJaccard, DUPLICATE_THRESHOLDS, PRIORITY_WEIGHTS,
} from '@/lib/insights/assist';

const DOCS = 'Multi-document loan packs stall at upload. Applicants abandon or resend packs when one document fails validation, and analysts lose track of which version is current.';
const SEASON_A = 'Seasonal SMEs flagged as distressed after off-season annualisation. Garden-supply and tourism borrowers were repeatedly flagged when an off-season quarter was annualised.';
const SEASON_B = 'Seasonality makes quarterly comparisons flag seasonal SMEs as distressed; annualised off-season revenue looks weak.';
const REG = 'Validation rules lag behind rule updates. Reporting teams patch validation rules manually after each regulatory update.';

describe('lexical similarity primitives', () => {
  it('stems common inflections to one form', () => {
    expect(stem('seasonality')).toBe(stem('seasonal'));
    expect(stem('quarterly')).toBe(stem('quarters'));
    expect(stem('uploads')).toBe('upload');
  });

  it('tokenize drops stopwords, short tokens and pure numbers', () => {
    const t = tokenize('The 2026 loan packs are at an upload stall').map((x) => x.surface);
    expect(t).toEqual(['loan', 'packs', 'upload', 'stall']);
  });

  it('identical documents have cosine 1 and identical titles trigram 1', () => {
    const c = buildTfIdf([DOCS, DOCS, REG]);
    expect(cosine(c.vectors[0], c.vectors[1])).toBeCloseTo(1, 5);
    expect(trigramJaccard('Multi-document loan packs stall at upload', 'Multi-document loan packs stall at upload')).toBe(1);
    expect(strengthOf(combinedScore(1, 1))).toBe('likely_duplicate');
  });

  it('related documents score between unrelated and identical', () => {
    const c = buildTfIdf([SEASON_A, SEASON_B, DOCS, REG]);
    const related = cosine(c.vectors[0], c.vectors[1]);
    const unrelated = cosine(c.vectors[0], c.vectors[2]);
    expect(related).toBeGreaterThan(DUPLICATE_THRESHOLDS.possible);
    expect(related).toBeLessThan(1);
    expect(unrelated).toBeLessThan(DUPLICATE_THRESHOLDS.possible);
    expect(sharedTerms(c.vectors[0], c.vectors[1], c.surfaces)).toEqual(expect.arrayContaining(['distressed']));
  });

  it('near-identical titles are caught by trigram overlap', () => {
    expect(trigramJaccard('Multi-document loan packs stall at upload', 'Multi document loan-packs stall on upload')).toBeGreaterThan(0.6);
    expect(trigramJaccard('Multi-document loan packs stall at upload', 'Validation rules lag behind rule updates')).toBeLessThan(0.2);
  });

  it('agglomerative clustering groups duplicates and leaves unrelated items apart', () => {
    const c = buildTfIdf([DOCS, REG, DOCS, SEASON_A, DOCS]);
    const clusters = agglomerate(c.vectors);
    const docsCluster = clusters.find((x) => x.members.includes(0))!;
    expect(docsCluster.members).toEqual([0, 2, 4]);
    expect(docsCluster.cohesion).toBeCloseTo(1, 2);
    expect(clusters.find((x) => x.members.includes(1))!.members).toEqual([1]);
    expect(clusterLabel([0, 2, 4].map((i) => c.vectors[i]), c.surfaces)).toEqual(expect.arrayContaining(['packs']));
  });
});

describe('periods and trend rule', () => {
  it('parses quarters and ranges (end quarter)', () => {
    expect(quarterKey('2026 Q2')).toBe(2026 * 4 + 1);
    expect(quarterKey('2026 Q2–Q3')).toBe(2026 * 4 + 2);
    expect(quarterKey('sometime')).toBeNull();
    expect(quarterLabel(quarterKey('2025 Q4')!)).toBe('2025 Q4');
  });

  it('suppresses direction below k overall or when a window would isolate < k orgs', () => {
    const k = 3;
    expect(trendDirection(2, 2, 0, k)).toBe('insufficient');
    expect(trendDirection(1, 1, 0, k)).toBe('insufficient');
    expect(trendDirection(4, 1, 3, k)).toBe('insufficient'); // recent window = 1 org → differencing risk
    expect(trendDirection(4, 3, 2, k)).toBe('insufficient');
    expect(trendDirection(3, 0, 3, k)).toBe('no_new_evidence');
    expect(trendDirection(3, 3, 0, k)).toBe('new_evidence');
    expect(trendDirection(6, 3, 3, k)).toBe('steady');
  });
});

describe('prioritisation score', () => {
  const base = { band: '3–5', quartersBehindLatest: 0, quality: { strong: 0, moderate: 0, limited: 0, unknown: 3 }, feedback: { useful: 0, needsEvidence: 0 }, hasIdea: false };

  it('is the transparent sum of its factor points and never exceeds 100', () => {
    const r = priorityScore(base);
    expect(r.factors.map((f) => f.key).sort()).toEqual(Object.keys(PRIORITY_WEIGHTS).sort());
    expect(r.total).toBe(Math.round(r.factors.reduce((s, f) => s + f.points, 0)));
    const max = priorityScore({ ...base, band: '10+', quality: { strong: 3, moderate: 0, limited: 0, unknown: 0 }, feedback: { useful: 5, needsEvidence: 0 } });
    expect(max.total).toBe(100);
  });

  it('unknown quality and too-few ratings are neutral, not assumed', () => {
    const r = priorityScore(base);
    expect(r.factors.find((f) => f.key === 'quality')!.value).toBe(0.5);
    expect(r.factors.find((f) => f.key === 'evidenceSufficiency')!.value).toBe(0.5);
    const weak = priorityScore({ ...base, feedback: { useful: 0, needsEvidence: 4 } });
    expect(weak.factors.find((f) => f.key === 'evidenceSufficiency')!.value).toBe(0);
  });

  it('banded breadth: repeated posts cannot inflate the score beyond the band', () => {
    expect(priorityScore({ ...base, band: '3–5' }).total).toBeLessThan(priorityScore({ ...base, band: '6–10' }).total);
    const withIdea = priorityScore({ ...base, hasIdea: true });
    expect(withIdea.factors.find((f) => f.key === 'unaddressed')!.points).toBe(0);
  });
});
