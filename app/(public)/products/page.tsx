import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { Reveal } from '@/components/motion';
import { listOfferings } from '@/lib/services/content';
import { getPrincipal } from '@/lib/auth/session';

export const metadata = { title: 'Products' };

export default async function Products() {
  const products = await listOfferings(await getPrincipal());
  const families = [...new Set(products.map((p) => p.domain))];
  return (
    <div className="mx-auto max-w-7xl px-4 py-14 md:px-8">
      <PageHeader eyebrow="Products" title="Built to Work. Designed to Evolve." description="Intelligent products for credit, reporting and applied AI. Development status is shown on each product; information is indicative and subject to validation." />
      {families.map((f) => (
        <section key={f} className="mb-12" aria-labelledby={`fam-${f}`}>
          <h2 id={`fam-${f}`} className="mb-4 text-xl font-semibold">{f}</h2>
          <ul className="grid gap-5 md:grid-cols-2">
            {products.filter((p) => p.domain === f).map((o, i) => (
              <Reveal key={o.id} delay={i * 0.05}>
                <li className="panel-solid flex h-full flex-col p-6 transition-transform hover:-translate-y-1">
                  <div className="flex items-start justify-between gap-3"><p className="eyebrow">{o.label}</p><span className="chip border-amber/40 text-amber">{o.status}</span></div>
                  <h3 className="mt-2 text-2xl font-semibold">{o.name}</h3>
                  <p className="mt-1 font-display text-ink-2">{o.tagline}</p>
                  <p className="mt-3 text-sm text-ink-3">{o.summary}</p>
                  <ul className="mt-4 flex flex-wrap gap-2">{o.capabilities.map((c) => <li key={c} className="chip">{c}</li>)}</ul>
                  <Link href={`/products/${o.slug}`} className="btn btn-ghost btn-sm mt-6 w-fit">View product</Link>
                </li>
              </Reveal>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
