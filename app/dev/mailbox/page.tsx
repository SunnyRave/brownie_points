import { desc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { schema, withSystemTx } from '@/lib/db';
import { isDemoMode } from '@/lib/settings';
import { emailProviderConfigured } from '@/lib/outbox';
import { fmtDateTime } from '@/components/ui';
import { Logo } from '@/components/site/Logo';

export const dynamic = 'force-dynamic';

/**
 * DEMO_MODE ONLY. Shows queued outbox emails so judges can follow magic links without a mail provider.
 * Must be disabled (DEMO_MODE unset) in any real deployment — it exposes sign-in links.
 */
export default async function Mailbox({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  if (!isDemoMode()) notFound();
  const { key } = await searchParams;
  const items = await withSystemTx((tx) => tx.select().from(schema.outbox).where(eq(schema.outbox.channel, 'email')).orderBy(desc(schema.outbox.createdAt)).limit(30));
  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-10">
      <Logo />
      <h1 className="mt-6 text-3xl font-semibold">Development mailbox</h1>
      <p className="mt-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
        Demo mode only. These emails are <strong>queued</strong> in the outbox{emailProviderConfigured() ? ' (a provider is configured; status changes to “sent” when accepted)' : ' — no email provider is configured, so nothing has been sent or delivered'}.
      </p>
      <ul className="mt-6 space-y-3">
        {items.map((m) => {
          const p = m.payload as { subject: string; text: string; link: string | null; kind: string };
          return (
            <li key={m.id} className={`panel-solid p-5 ${m.dedupeKey === key ? 'ring-2 ring-teal' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{p.subject}</p>
                <span className="chip">status: {m.status}</span>
              </div>
              <p className="mt-1 text-sm text-ink-3">To {m.recipient} · {fmtDateTime(m.createdAt)} · {p.kind}</p>
              {p.link && <a href={p.link} className="btn btn-primary btn-sm mt-3">Open link</a>}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
