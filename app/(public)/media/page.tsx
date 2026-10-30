import { PlayCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { Reveal } from '@/components/motion';
import { getPage, listContent } from '@/lib/services/content';

export const metadata = { title: 'Media' };
export default async function Media() {
  const [page, items] = await Promise.all([getPage(null, 'media'), listContent(null, 'media')]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 md:px-8">
      <PageHeader eyebrow="Media" title={page.summary ?? page.title} description={page.body} />
      <ul className="grid gap-5 md:grid-cols-2">
        {items.map((m, i) => {
          const meta = m.meta as { kind?: string; availability?: string };
          return (
            <Reveal key={m.id} delay={i * 0.05}>
              <li className="panel-solid overflow-hidden">
                <div className="spotlight grid aspect-video place-items-center bg-surface-deep">
                  <PlayCircle size={52} className="text-teal/60" aria-hidden />
                </div>
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2"><span className="chip">{meta.kind}</span>{meta.availability === 'coming_soon' && <span className="chip border-amber/40 text-amber">Video coming soon</span>}</div>
                  <h2 className="mt-3 text-lg font-semibold">{m.title}</h2>
                  <p className="mt-1 text-sm text-ink-3">{m.summary}</p>
                </div>
              </li>
            </Reveal>
          );
        })}
      </ul>
    </div>
  );
}
