import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { Reveal } from '@/components/motion';
import { pageMeta, type SolutionsMeta } from '@/lib/services/pages';
import { listOfferings } from '@/lib/services/content';

export const metadata = { title: 'Solutions' };
export default async function Solutions() {
  const [{ row, meta }, products] = await Promise.all([pageMeta<SolutionsMeta>('solutions'), listOfferings(null)]);
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  return (
    <div className="mx-auto max-w-7xl px-4 py-14 md:px-8">
      <PageHeader eyebrow="Solutions" title={row.title} description={row.summary} />
      <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {meta.areas.map((a, i) => (
          <Reveal key={a.title} delay={i * 0.05}>
            <li className="panel-solid h-full p-6">
              <p className="font-mono text-xs text-muted">0{i + 1}</p>
              <h2 className="mt-2 text-xl font-semibold">{a.title}</h2>
              <p className="mt-2 text-sm text-ink-2">{a.body}</p>
              <p className="mt-4 text-xs text-muted">Related products</p>
              <ul className="mt-2 flex flex-wrap gap-2">{a.products.map((s) => bySlug.get(s) && <li key={s}><Link href={`/products/${s}`} className="chip hover:border-teal">{bySlug.get(s)!.name}</Link></li>)}</ul>
            </li>
          </Reveal>
        ))}
      </ul>
    </div>
  );
}
