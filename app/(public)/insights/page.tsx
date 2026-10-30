import { PageHeader } from '@/components/ui';
import { Reveal } from '@/components/motion';
import { listContent } from '@/lib/services/content';

export const metadata = { title: 'Insights' };
export default async function Insights() {
  const items = await listContent(null, 'insight');
  return (
    <div className="mx-auto max-w-5xl px-4 py-14 md:px-8">
      <PageHeader eyebrow="Perspectives" title="Insights" description="Ideas on explainability, reporting and applied AI. Client community insights live inside authenticated workspaces." />
      <ul className="grid gap-5 md:grid-cols-2">
        {items.map((i, k) => (
          <Reveal key={i.id} delay={k * 0.05}>
            <li id={i.id} className="panel-solid h-full p-6">
              <span className="chip">{String((i.meta as { topic?: string }).topic ?? 'Insight')}</span>
              <h2 className="mt-3 text-xl font-semibold">{i.title}</h2>
              <p className="mt-2 text-ink-2">{i.summary}</p>
            </li>
          </Reveal>
        ))}
      </ul>
    </div>
  );
}
