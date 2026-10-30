import { PageHeader } from '@/components/ui';
import { Reveal } from '@/components/motion';
import { pageMeta, type TechnologyMeta } from '@/lib/services/pages';

export const metadata = { title: 'Technology' };
export default async function Technology() {
  const { meta } = await pageMeta<TechnologyMeta>('technology');
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 md:px-8">
      <PageHeader eyebrow="Technology" title={meta.title} description={meta.intro} />
      <ul className="grid gap-5 md:grid-cols-2">
        {meta.pillars.map((p, i) => (
          <Reveal key={p.title} delay={i * 0.05}><li className="panel-solid h-full p-6"><h2 className="text-xl font-semibold">{p.title}</h2><p className="mt-2 text-ink-2">{p.body}</p></li></Reveal>
        ))}
      </ul>
      <h2 className="mt-14 text-2xl font-semibold">{meta.architectureTitle}</h2>
      <ol className="mt-6 space-y-3">
        {meta.layers.map((l, i) => (
          <Reveal key={l.title} delay={i * 0.06}>
            <li className={`${i === meta.layers.length - 1 ? 'panel-glass' : 'panel-solid'} flex flex-wrap items-center justify-between gap-3 p-5`} style={{ marginLeft: `${i * 2}%`, marginRight: `${i * 2}%` }}>
              <span className="font-semibold">{l.title}</span><span className="font-mono text-xs text-ink-3">{l.body}</span>
            </li>
          </Reveal>
        ))}
      </ol>
    </div>
  );
}
