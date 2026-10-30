import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { Reveal } from '@/components/motion';
import { pageMeta, type LabMeta } from '@/lib/services/pages';

export const metadata = { title: 'AI Lab' };
export default async function Lab() {
  const { meta } = await pageMeta<LabMeta>('lab');
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 md:px-8">
      <PageHeader eyebrow="AI Lab" title={meta.title} description={meta.intro} actions={<Link href="/hackathon" className="btn btn-primary">Join the hackathon</Link>} />
      <ol className="grid gap-5 md:grid-cols-2">
        {meta.sections.map((s, i) => (
          <Reveal key={s.title} delay={i * 0.05}>
            <li className="panel-solid h-full p-6"><p className="font-mono text-xs text-teal">0{i + 1}</p><h2 className="mt-2 text-xl font-semibold">{s.title}</h2><p className="mt-2 text-ink-2">{s.body}</p></li>
          </Reveal>
        ))}
      </ol>
    </div>
  );
}
