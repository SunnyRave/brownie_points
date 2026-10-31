import Link from 'next/link';
import { Bookmark, BellRing, Search } from 'lucide-react';
import { EmptyState, PageHeader, SharedLabel, fmtDate } from '@/components/ui';
import { listBookmarks, listSavedSearches, listSubscriptions, runSavedSearch } from '@/lib/services/engagement';
import { FILTER_DIMENSIONS } from '@/lib/insights';
import type { Principal } from '@/lib/policy/types';
import { SavedAction } from './SavedActions';

const FILTER_LABEL = Object.fromEntries(FILTER_DIMENSIONS.map((d) => [d.key, d.label])) as Record<string, string>;

/**
 * Bookmarks, saved searches and theme subscriptions for the signed-in user. Everything is re-evaluated now:
 * bookmarks re-check visibility, saved searches re-run through the community feed's k-threshold rules.
 */
export async function SavedView({ principal, communityHref }: { principal: Principal; communityHref: string }) {
  const [bookmarks, searches, subs] = await Promise.all([listBookmarks(principal), listSavedSearches(principal), listSubscriptions(principal)]);
  const runs = await Promise.all(searches.map((s) => runSavedSearch(principal, s.id)));
  const fixHref = (h: string) => (h.startsWith('/w/_/') ? communityHref.replace(/\/community$/, '') + h.slice(4) : h);
  return (
    <>
      <PageHeader eyebrow="Your workspace" title="Saved & bookmarks" description={<span className="flex flex-wrap items-center gap-2">Only you can see this list. Items are re-checked every time — anything withdrawn or unpublished shows as unavailable. <SharedLabel /></span>} />
      <div className="grid gap-8 xl:grid-cols-2">
        <section aria-labelledby="bm-h">
          <h2 id="bm-h" className="mb-3 flex items-center gap-2 text-xl font-semibold"><Bookmark size={18} aria-hidden /> Bookmarks</h2>
          {bookmarks.length === 0 ? <EmptyState title="No bookmarks yet" body="Use “Bookmark” on a shared contribution to keep it here." /> : (
            <ul className="space-y-3">
              {bookmarks.map((b) => (
                <li key={b.id} className="panel-solid flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-muted">{b.sourceType === 'idea' ? 'Improvement idea' : 'Shared contribution'} · saved {fmtDate(b.createdAt)}</p>
                    {b.available ? <Link href={fixHref(b.href)} className="mt-1 block font-semibold hover:underline">{b.title}</Link> : <p className="mt-1 italic text-ink-3">No longer available</p>}
                    {b.detail && <p className="mt-1 text-xs text-ink-3">{b.detail}</p>}
                  </div>
                  <SavedAction url="/api/bookmarks" body={{ sourceType: b.sourceType, sourceId: b.sourceId }} label="Remove" confirmLabel="Remove bookmark" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="ss-h">
          <h2 id="ss-h" className="mb-3 flex items-center gap-2 text-xl font-semibold"><Search size={18} aria-hidden /> Saved searches</h2>
          <p className="mb-3 text-sm text-ink-3">Only the query and filters are stored — never results. Each run applies today’s visibility and minimum-organisation rules.</p>
          {searches.length === 0 ? <EmptyState title="No saved searches" body="Use “Save this search” on the shared feed." /> : (
            <ul className="space-y-3">
              {runs.map((r) => {
                const qs = new URLSearchParams({ ...(r.search.query ? { q: r.search.query } : {}), ...(r.search.filters as Record<string, string>) });
                return (
                  <li key={r.search.id} className="panel-solid p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{r.search.name}</p>
                        <p className="mt-1 flex flex-wrap gap-2 text-xs">
                          {r.search.query && <span className="chip">“{r.search.query}”</span>}
                          {Object.entries(r.search.filters).map(([k, v]) => <span key={k} className={`chip ${r.rejected.includes(k as never) ? 'line-through opacity-60' : ''}`}>{FILTER_LABEL[k] ?? k}: {v}</span>)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link className="btn btn-primary btn-sm" href={`${communityHref}?${qs}`}>Open in feed</Link>
                        <SavedAction url={`/api/saved-searches/${r.search.id}`} label="Delete" confirmLabel={`Delete saved search ${r.search.name}`} />
                      </div>
                    </div>
                    <p className="mt-2 font-mono text-xs text-ink-3" aria-live="polite">{r.count} matching approved contribution{r.count === 1 ? '' : 's'} right now</p>
                    {r.rejected.length > 0 && <p className="mt-1 text-xs text-amber">Some filters are no longer applied because they would narrow results below {r.k} organisations.</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="sub-h" className="xl:col-span-2">
          <h2 id="sub-h" className="mb-3 flex items-center gap-2 text-xl font-semibold"><BellRing size={18} aria-hidden /> Followed themes</h2>
          <p className="mb-3 text-sm text-ink-3">You get an in-app notice when a contribution is approved into a followed theme, plus a weekly digest. Counts appear only as bands once enough distinct organisations contribute; emerging themes show “new activity” without numbers.</p>
          {subs.length === 0 ? <EmptyState title="Not following any themes" body="Use “Follow theme” on the theme dashboard." /> : (
            <ul className="flex flex-wrap gap-3">
              {subs.map((s) => (
                <li key={s.themeId} className="panel-solid flex items-center gap-3 px-4 py-2">
                  <span>{s.name}</span>
                  <SavedAction url={`/api/themes/${s.themeId}/subscription`} label="Unfollow" confirmLabel={`Unfollow ${s.name}`} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
