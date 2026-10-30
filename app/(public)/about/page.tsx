import { PageHeader } from '@/components/ui';
import { Reveal } from '@/components/motion';
import { pageMeta, type AboutMeta } from '@/lib/services/pages';

export const metadata = { title: 'About' };
export default async function About() {
  const { meta } = await pageMeta<AboutMeta>('about');
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 md:px-8">
      <PageHeader eyebrow="About azentio.ai" title={meta.tagline} description={meta.approach} />
      <div className="grid gap-5 md:grid-cols-2">
        <Reveal className="panel-solid p-6"><p className="eyebrow">Mission</p><p className="mt-3 font-display text-xl">{meta.mission}</p></Reveal>
        <Reveal className="panel-solid p-6" delay={0.05}><p className="eyebrow">Vision</p><p className="mt-3 font-display text-xl">{meta.vision}</p></Reveal>
      </div>
      <h2 className="mt-12 text-2xl font-semibold">Principles</h2>
      <ul className="mt-4 grid gap-5 md:grid-cols-2">
        {meta.principles.map((p) => <li key={p.title} className="panel-solid p-6"><p className="font-semibold">{p.title}</p><p className="mt-2 text-sm text-ink-2">{p.body}</p></li>)}
      </ul>
      <section className="panel-glass mt-12 p-6 md:p-8">
        <h2 className="text-2xl font-semibold">{meta.company.title}</h2>
        <ul className="mt-4 space-y-2 text-ink-2">{meta.company.facts.map((f) => <li key={f} className="flex gap-2"><span className="text-teal">•</span>{f}</li>)}</ul>
        <p className="mt-4 text-xs text-muted">Sources: {meta.company.sources.join(' · ')}. Customer and headcount figures are omitted because public sources differ.</p>
      </section>
    </div>
  );
}
