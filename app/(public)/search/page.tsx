import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { search } from '@/lib/search';
import { getPrincipal } from '@/lib/auth/session';

export const metadata = { title: 'Search' };

function Snippet({ text }: { text: string }) {
  return <>{text.split(/(<<.*?>>)/g).map((part, i) => (part.startsWith('<<') ? <mark key={i} className="rounded bg-teal/20 px-0.5 text-ink">{part.slice(2, -2)}</mark> : part))}</>;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').slice(0, 200);
  const p = await getPrincipal();
  const { results, count } = q ? await search(p, q) : { results: [], count: 0 };
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 md:px-8">
      <PageHeader eyebrow="Search" title="Search" description={p ? 'Results include everything your session is permitted to see.' : 'Public content only. Sign in to search your workspace and the shared community.'} />
      <form className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">Search</label>
        <input id="q" name="q" defaultValue={q} className="input" placeholder="e.g. seasonality, document upload" />
        <button className="btn btn-primary">Search</button>
      </form>
      {q && <p className="mt-6 text-sm text-ink-3" aria-live="polite">{count} result{count === 1 ? '' : 's'}</p>}
      <ul className="mt-4 space-y-3">
        {results.map((r) => (
          <li key={r.id} className={r.audience === 'shared_community' ? 'panel-glass p-5' : 'panel-solid p-5'}>
            <span className="chip">{r.audience === 'shared_community' ? 'Shared community' : r.audience === 'employee' ? 'Employee only' : r.audience.startsWith('tenant:') ? 'Your organisation' : 'Public'}</span>
            <Link href={r.url} className="mt-2 block text-lg font-semibold hover:text-teal">{r.title}</Link>
            <p className="mt-1 text-sm text-ink-3"><Snippet text={r.snippet} /></p>
          </li>
        ))}
      </ul>
    </div>
  );
}
