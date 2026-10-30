import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { Reveal } from '@/components/motion';
import { getOffering } from '@/lib/services/content';
import { getPrincipal } from '@/lib/auth/session';
import { HttpError } from '@/lib/http';
import { PRODUCT_DISCLAIMER } from '@/scripts/azentio-catalogue';

export default async function ProductDetail({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getPrincipal();
  let o;
  try {
    o = await getOffering(p, (await params).slug);
  } catch (e) {
    if (e instanceof HttpError) notFound();
    throw e;
  }
  const isClient = p?.memberships.some((m) => m.orgType === 'client' && m.status === 'active');
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 md:px-8">
      <PageHeader
        eyebrow={`${o.domain} · ${o.label}`}
        title={o.name}
        description={<><p className="font-display text-xl text-ink">{o.tagline}</p><p className="mt-2">{o.summary}</p></>}
        actions={<>
          <Link href={isClient ? '/w/_/demos' : '/demo'} className="btn btn-primary">{isClient ? 'Try sandbox' : 'Request demo'}</Link>
          {!isClient && <Link href="/login?as=client" className="btn btn-ghost">Client? Sign in</Link>}
        </>}
      />
      <p className="-mt-4 mb-8"><span className="chip border-amber/40 text-amber">Development status: {o.status}</span></p>
      <div className="grid gap-6 lg:grid-cols-3">
        <Reveal className="panel-solid p-6">
          <h2 className="font-semibold">Capabilities</h2>
          <ul className="mt-4 space-y-3">{o.capabilities.map((c) => <li key={c} className="panel-deep px-4 py-3 text-sm">{c}</li>)}</ul>
        </Reveal>
        <Reveal className="panel-solid p-6" delay={0.05}>
          <h2 className="font-semibold">How it works</h2>
          <ol className="mt-4 space-y-3">
            {o.steps.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-sm"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-teal/50 font-mono text-xs text-teal">{i + 1}</span>{s}</li>
            ))}
          </ol>
        </Reveal>
        <Reveal className="panel-solid p-6" delay={0.1}>
          <h2 className="font-semibold">Intended outcomes</h2>
          <ul className="mt-4 space-y-3">{o.outcomes.map((x) => <li key={x} className="flex items-center gap-2 text-sm"><CheckCircle2 size={16} className="shrink-0 text-teal" aria-hidden /> {x}</li>)}</ul>
          <p className="mt-5 text-xs text-muted">{PRODUCT_DISCLAIMER}</p>
        </Reveal>
      </div>
      <section className="panel-glass mt-8 flex flex-col items-start gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <p className="text-ink-2">See how this solution could fit your business processes and enterprise environment.</p>
        <Link href="/demo" className="btn btn-primary">Start a Conversation</Link>
      </section>
    </div>
  );
}
