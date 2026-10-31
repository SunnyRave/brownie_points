import Link from 'next/link';
import { TrendingUp } from 'lucide-react';
import { themeTrendChanges, type TrendDirection } from '@/lib/insights/assist';
import type { Principal } from '@/lib/policy/types';
import { MethodNote } from './MethodNote';

const TONE: Record<TrendDirection, string> = {
  new_evidence: 'chip border-teal/50 text-teal',
  steady: 'chip border-violet/40 text-violet-text',
  no_new_evidence: 'chip',
  insufficient: 'chip text-muted',
};
const LABEL: Record<TrendDirection, string> = {
  new_evidence: 'New evidence this quarter',
  steady: 'Steady',
  no_new_evidence: 'No new evidence',
  insufficient: 'Insufficient evidence',
};

/** Trend-change summaries per theme. Directions only where differencing cannot isolate < k organisations. */
export async function TrendChanges({ principal }: { principal: Principal }) {
  const { trends, k, latestPeriod, caveat, method } = await themeTrendChanges(principal);
  if (!trends.length) return null;
  return (
    <section aria-labelledby="trends-h" className="mb-10">
      <h2 id="trends-h" className="mb-1 flex items-center gap-2 text-xl font-semibold"><TrendingUp size={18} aria-hidden /> What changed{latestPeriod ? ` in ${latestPeriod}` : ''}</h2>
      <p className="mb-4 text-sm text-ink-3">Compares distinct contributing organisations (never post counts) in the latest observation period with earlier periods. A direction is shown only when the theme has at least {k} organisations and each compared period has none or at least {k}.</p>
      <ul className="grid gap-3 md:grid-cols-2">
        {trends.map((t) => (
          <li key={t.themeId} className="panel-solid p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{t.name}</p>
              <span className={TONE[t.direction]}>{LABEL[t.direction]}</span>
            </div>
            <p className="mt-2 text-sm text-ink-2">{t.text}</p>
            <p className="mt-2 text-xs text-ink-3">{t.orgBand ? `${t.orgBand} organisations · ` : 'Emerging or suppressed — no counts · '}Confidence: {t.confidence}</p>
            {t.evidence.length > 0 && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-xs text-ink-3">Evidence ({t.evidence.length} shared insights)</summary>
                <ul className="mt-1 grid gap-1">
                  {t.evidence.map((e) => <li key={e.id}><Link className="underline-offset-2 hover:underline" href={`/community/${e.id}`}>{e.title}</Link>{e.period && <span className="text-xs text-ink-3"> · {e.period}</span>}</li>)}
                </ul>
              </details>
            )}
            <p className="mt-2 text-xs text-muted">Limitations: {t.limitations}</p>
          </li>
        ))}
      </ul>
      <div className="mt-3"><MethodNote>{method} {caveat}</MethodNote></div>
    </section>
  );
}
