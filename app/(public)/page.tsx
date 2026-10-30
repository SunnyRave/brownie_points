import Link from 'next/link';
import { ArrowRight, Bot, FileSearch, Gauge, KeyRound, LineChart, Lock, ScrollText, Settings2, ShieldCheck, Sparkles, UserCheck, Users, Server, Workflow } from 'lucide-react';
import { HeroNetwork, Spotlight } from '@/components/hero/HeroNetwork';
import { CountUp, Magnetic, Reveal, StaggerWords } from '@/components/motion';
import { ProductExplorer } from '@/components/home/ProductExplorer';
import { LearningJourney } from '@/components/home/LearningJourney';
import { VisibilityLens } from '@/components/home/VisibilityLens';
import { ThemeConstellation } from '@/components/home/ThemeConstellation';
import { AiraPanel } from '@/components/aira/AiraDock';
import { getBanner, getPage, listOfferings } from '@/lib/services/content';
import { publicThemePreview } from '@/lib/insights';
import { getPrincipal } from '@/lib/auth/session';
import type { HOME } from '@/scripts/azentio-catalogue';

const CAP_ICONS = [Gauge, FileSearch, Bot, LineChart, Settings2, ShieldCheck];
const TRUST_ICONS = [KeyRound, Users, ScrollText, Lock, UserCheck, Server];

export default async function Home() {
  const [products, banner, principal, page, themes] = await Promise.all([listOfferings(null), getBanner(), getPrincipal(), getPage(null, 'home'), publicThemePreview()]);
  const home = page.meta as unknown as typeof HOME;
  const families = new Set(products.map((p) => p.domain));
  const meta = (banner?.meta ?? {}) as { ctaLabel?: string; ctaHref?: string };
  const stats: [number, string][] = [
    [products.length, 'intelligent products'],
    [families.size, 'product families'],
    [home.capabilities.length, 'layers of intelligence'],
    [home.trust.length, 'trust-by-design pillars'],
  ];
  return (
    <>
      {banner && (
        <div className="border-b border-line/60 bg-teal/5">
          <p className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3 px-4 py-2 text-center text-sm">
            <span className="font-semibold">{banner.title}</span> <span className="text-ink-3">{banner.body}</span>
            {meta.ctaHref && <Link href={meta.ctaHref} className="text-teal underline-offset-4 hover:underline">{meta.ctaLabel ?? 'Learn more'} →</Link>}
          </p>
        </div>
      )}

      <Spotlight className="relative">
        <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-14 md:grid-cols-[1.1fr_1fr] md:px-8 md:pt-20">
          <div>
            <p className="eyebrow">Activating intelligence / 01</p>
            <h1 className="mt-4 text-4xl font-bold leading-[1.05] md:text-6xl">
              <StaggerWords text={home.hero.headline} />
              <br />
              <span className="gradient-text">{home.hero.highlight}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-2">{home.hero.sub}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Magnetic><Link href="/products" className="btn btn-primary">Explore our products <ArrowRight size={16} aria-hidden /></Link></Magnetic>
              <Link href={principal ? '/portal' : '/login'} className="btn btn-ghost">{principal ? 'Open my portal' : 'Sign in to the portal'}</Link>
            </div>
            <dl className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map(([n, l]) => (
                <div key={l} className="panel-deep p-3">
                  <dt className="sr-only">{l}</dt>
                  <dd className="font-display text-2xl font-semibold text-teal"><CountUp to={n} /></dd>
                  <dd className="text-xs text-ink-3">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex justify-center"><HeroNetwork /></div>
        </section>
      </Spotlight>

      <section aria-label="Products and capabilities" className="marquee border-y border-line/60 py-4">
        <div className="marquee-track">
          {[0, 1].map((dup) => [...products.map((p) => p.name), ...home.capabilities.map((c) => c.title)].map((c, i) => <span key={`${dup}-${i}`} className="chip text-sm" aria-hidden={dup === 1}>{c}</span>))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-20 md:grid-cols-[1fr_1.4fr] md:px-8 [&>*]:min-w-0">
        <Reveal>
          <p className="eyebrow">Who we are</p>
          <h2 className="mt-2 text-3xl font-semibold md:text-4xl">{home.whoWeAre.title}</h2>
          <p className="mt-4 text-ink-2">{home.whoWeAre.body}</p>
          <Link href="/about" className="btn btn-ghost btn-sm mt-6">About azentio.ai</Link>
        </Reveal>
        <div>
          <Reveal><p className="eyebrow">What we do</p><h2 className="mt-2 text-2xl font-semibold">{home.capabilitiesTitle}</h2></Reveal>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {home.capabilities.map((c, i) => {
              const Icon = CAP_ICONS[i % CAP_ICONS.length];
              return (
                <Reveal key={c.title} delay={i * 0.05}>
                  <li className="panel-solid flex h-full gap-4 p-5 transition-transform hover:-translate-y-1">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal/10 text-teal"><Icon size={18} aria-hidden /></span>
                    <span><span className="block font-semibold">{c.title}</span><span className="text-sm text-ink-3">{c.body}</span></span>
                  </li>
                </Reveal>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 md:px-8">
        <Reveal>
          <p className="eyebrow">Featured products</p>
          <h2 className="mt-2 text-3xl font-semibold md:text-4xl">{home.productsTitle}</h2>
        </Reveal>
        <Reveal className="mt-8">
          <ProductExplorer products={products.map((p) => ({ slug: p.slug, name: p.name, family: p.domain, label: p.label, tagline: p.tagline, summary: p.summary, capabilities: p.capabilities, steps: p.steps, status: p.status }))} />
        </Reveal>
        <p className="mt-3 text-xs text-muted">Development status shown per product. Benefits describe intended outcomes, not verified performance claims.</p>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-8">
        <Reveal className="panel-glass flex flex-col items-start gap-6 p-8 md:flex-row md:items-center md:justify-between md:p-10">
          <div><p className="eyebrow">See intelligence in action</p><h2 className="mt-2 text-2xl font-semibold md:text-3xl">{home.inAction.title}</h2></div>
          <Link href="/media" className="btn btn-primary">{home.inAction.cta}</Link>
        </Reveal>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 md:px-8">
        <Reveal><p className="eyebrow">Trust by design</p><h2 className="mt-2 text-3xl font-semibold md:text-4xl">{home.trustTitle}</h2><p className="mt-3 max-w-2xl text-ink-2">Each pillar below is how this portal actually works — enforced on the server and covered by automated tests.</p></Reveal>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {home.trust.map((t, i) => {
            const Icon = TRUST_ICONS[i % TRUST_ICONS.length];
            return (
              <Reveal key={t.title} delay={i * 0.05}>
                <li className="panel-solid h-full p-5"><Icon className="text-teal" size={20} aria-hidden /><p className="mt-3 font-semibold">{t.title}</p><p className="mt-1 text-sm text-ink-3">{t.body}</p></li>
              </Reveal>
            );
          })}
        </ul>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 md:px-8">
        <Reveal>
          <p className="eyebrow">Collective learning</p>
          <h2 className="mt-2 text-3xl font-semibold md:text-4xl">From a private observation to a better product</h2>
          <p className="mt-3 max-w-2xl text-ink-2">Clients share reviewed, de-identified market observations; recurring themes become improvement ideas. This is a moderated learning community, not federated machine learning — and joining a workspace is never consent to share or train on your data.</p>
        </Reveal>
        <div className="mt-10"><LearningJourney /></div>
        <Reveal className="mt-14"><VisibilityLens /></Reveal>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 md:px-8">
        <Reveal>
          <p className="eyebrow">Shared themes · live</p>
          <h2 className="mt-2 text-3xl font-semibold md:text-4xl">Themes appear only when enough organisations agree</h2>
          <p className="mt-3 max-w-2xl text-ink-2">Shown here only once at least {themes.k} distinct organisations contribute, as bands rather than counts. {themes.emergingCount > 0 && `${themes.emergingCount} more theme${themes.emergingCount > 1 ? 's are' : ' is'} still emerging and not shown.`}</p>
        </Reveal>
        <Reveal className="mt-8">
          {themes.established.length > 0 ? <ThemeConstellation themes={themes.established} /> : <p className="panel-deep p-6 text-ink-3">No theme has reached the threshold yet.</p>}
        </Reveal>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-16 md:grid-cols-2 md:px-8 [&>*]:min-w-0">
        <Reveal>
          <p className="eyebrow">AIRA</p>
          <h2 className="mt-2 text-3xl font-semibold md:text-4xl">Answers with receipts</h2>
          <p className="mt-3 text-ink-2">AIRA retrieves only what you are allowed to see — filtered before ranking — and cites every claim. No citation, no claim. Withdrawn material is blocked on every query.</p>
          <ul className="mt-6 space-y-2 text-sm text-ink-3">
            <li className="flex gap-2"><ShieldCheck size={16} className="text-teal" aria-hidden /> Visitors: public content only</li>
            <li className="flex gap-2"><ShieldCheck size={16} className="text-teal" aria-hidden /> Clients: + approved shared insights, never employee-only notes</li>
            <li className="flex gap-2"><Sparkles size={16} className="text-teal" aria-hidden /> Private records never reach an AI provider</li>
          </ul>
        </Reveal>
        <Reveal className="panel-solid h-[380px] p-5"><AiraPanel scopeLabel={principal ? 'your permitted sources' : 'public content only'} suggestions={['What does RIVA do?', 'How does the SME Credit Decisioning Workbench work?']} /></Reveal>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 md:px-8">
        <Reveal><p className="eyebrow">What’s happening</p><h2 className="mt-2 text-3xl font-semibold md:text-4xl">{home.happeningTitle}</h2></Reveal>
        <ul className="mt-8 grid gap-4 md:grid-cols-3">
          {home.happening.map((h, i) => (
            <Reveal key={h.title} delay={i * 0.06}>
              <li><Link href={h.href} className="panel-solid block h-full p-6 transition-transform hover:-translate-y-1"><p className="font-display text-xl font-semibold">{h.title}</p><p className="mt-2 text-sm text-ink-3">{h.body}</p><span className="mt-4 inline-flex items-center gap-1 text-sm text-teal">Explore <ArrowRight size={14} aria-hidden /></span></Link></li>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 md:px-8">
        <Reveal className="panel-glass flex flex-col items-start gap-6 p-8 md:flex-row md:items-center md:justify-between md:p-12">
          <div>
            <p className="eyebrow">{home.cta.eyebrow}</p>
            <h2 className="mt-2 text-3xl font-semibold">{home.cta.title}</h2>
            <p className="mt-2 max-w-xl text-ink-2">{home.cta.body}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Magnetic><Link href="/demo" className="btn btn-primary">{home.cta.label}</Link></Magnetic>
            <Link href="/hackathon" className="btn btn-ghost">Join the hackathon</Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
