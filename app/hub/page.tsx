import Link from 'next/link';
import { FlaskConical, Radio, BookOpen, Lightbulb, Users, ShieldCheck } from 'lucide-react';
import { EmployeeLabel, PageHeader, Stat, fmtDate } from '@/components/ui';
import { Reveal } from '@/components/motion';
import { requirePrincipal } from '@/lib/page';
import { listBroadcasts, listContent } from '@/lib/services/content';
import { listIdeasForEmployee } from '@/lib/services/ideas';
import { themeDashboard } from '@/lib/insights';
import { hasGrant } from '@/lib/policy/authorize';

export default async function HubDashboard() {
  const p = await requirePrincipal();
  const [broadcasts, experiments, ideas, { themes }] = await Promise.all([listBroadcasts(p), listContent(p, 'experiment'), listIdeasForEmployee(p), themeDashboard(p)]);
  const internal = broadcasts.filter((b) => b.audience?.kind === 'employee');
  const grants = p.grants.map((g) => g.grant);
  const tiles = [
    { href: '/hub/playground', icon: FlaskConical, title: 'Playground', body: 'Guided synthetic scenarios' },
    { href: '/hub/live', icon: Radio, title: 'Live', body: `${internal.filter((b) => b.status !== 'ended').length} upcoming internal sessions` },
    { href: '/hub/experiments', icon: FlaskConical, title: 'Experiments', body: `${experiments.length} active notes` },
    { href: '/hub/library', icon: BookOpen, title: 'Knowledge library', body: 'Owned docs with review dates' },
    { href: '/hub/community', icon: Users, title: 'Collective learning', body: `${themes.filter((t) => !t.emerging).length} established themes` },
    { href: '/hub/ideas', icon: Lightbulb, title: 'Ideas', body: `${ideas.length} improvement ideas` },
  ];
  return (
    <>
      <PageHeader eyebrow="Employee hub" title={`Hello, ${p.name.split(' ')[0]}`} description={<span className="flex flex-wrap items-center gap-2">Internal experiments and sessions are restricted to employees. <EmployeeLabel /></span>} />
      <div className="mb-6 flex flex-wrap gap-2">
        <span className="chip"><ShieldCheck size={12} aria-hidden /> employee membership</span>
        {grants.length ? grants.map((g) => <span key={g} className="chip border-amber/40 text-amber">grant: {g.replace('_', ' ')}</span>) : <span className="chip text-muted">no additional grants (least privilege)</span>}
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t, i) => (
          <Reveal key={t.href} delay={i * 0.04}>
            <li><Link href={t.href} className="panel-solid flex h-full items-start gap-4 p-5 transition-transform hover:-translate-y-1">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber/15 text-amber"><t.icon size={20} aria-hidden /></span>
              <span><span className="block font-semibold">{t.title}</span><span className="text-sm text-ink-3">{t.body}</span></span>
            </Link></li>
          </Reveal>
        ))}
      </ul>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="panel-solid p-6">
          <h2 className="font-semibold">Internal sessions</h2>
          <ul className="mt-3 space-y-2">{internal.map((b) => <li key={b.id} className="panel-deep flex justify-between p-3 text-sm"><span>{b.title}</span><span className="text-xs text-ink-3">{fmtDate(b.startsAt)} · {b.status}</span></li>)}</ul>
        </section>
        <section className="panel-solid p-6">
          <h2 className="font-semibold">{hasGrant(p, 'product_owner') ? 'Your improvement ideas' : 'Improvement ideas'}</h2>
          <ul className="mt-3 space-y-2">{ideas.slice(0, 5).map((i) => <li key={i.id} className="panel-deep flex justify-between gap-3 p-3 text-sm"><span>{i.title}</span><span className="chip">{i.status.replace('_', ' ')}</span></li>)}</ul>
        </section>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Themes (established)" value={themes.filter((t) => !t.emerging).length} tone="text-teal" />
        <Stat label="Themes (emerging)" value={themes.filter((t) => t.emerging).length} />
        <Stat label="Ideas in flight" value={ideas.filter((i) => !['released', 'not_proceeding'].includes(i.status)).length} tone="text-amber" />
        <Stat label="Your grants" value={grants.length} />
      </div>
    </>
  );
}
