import { ThemeConstellation } from '@/components/home/ThemeConstellation';
import { CommunityFeed } from './CommunityFeed';
import { PageHeader, SharedLabel } from '@/components/ui';
import { themeDashboard } from '@/lib/insights';
import type { Principal } from '@/lib/policy/types';

export async function CommunityView({ principal, focus }: { principal: Principal; focus?: string }) {
  const { themes, k } = await themeDashboard(principal);
  return (
    <>
      <PageHeader eyebrow="Shared community" title="Collective learning" description={<span className="flex flex-wrap items-center gap-2">Reviewed, de-identified contributions from client organisations. <SharedLabel /></span>} />
      <section aria-labelledby="themes-h" className="mb-10">
        <h2 id="themes-h" className="mb-1 text-xl font-semibold">Theme dashboard</h2>
        <p className="mb-4 text-sm text-ink-3">Counts appear only once at least {k} distinct organisations contribute, and only as bands. Repeated posts from one organisation count once. Popularity is not prevalence or proof of cause.</p>
        <ThemeConstellation
          themes={themes.map((t) => ({ ...t, evidence: t.evidence.map((e) => ({ id: e.id, title: e.title, region: e.region, period: e.period })) }))}
        />
      </section>
      <CommunityFeed focus={focus} />
    </>
  );
}
