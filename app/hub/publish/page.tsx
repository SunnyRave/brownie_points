import { Denied, PageHeader } from '@/components/ui';
import { PublishTools } from '@/components/publish/PublishTools';
import { requirePrincipal, guarded } from '@/lib/page';
import { enforce } from '@/lib/policy/enforce';
import { getBanner, listBroadcasts } from '@/lib/services/content';
import { withSystemTx, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export default async function Publish() {
  const p = await requirePrincipal();
  const r = await guarded(() => enforce(p, 'publish_content', { type: 'banner', audience: { kind: 'public' } }));
  if (!r.ok) return <Denied status={r.status} message="Publishing requires the content_publisher grant." />;
  const [banner, broadcasts, orgs] = await Promise.all([getBanner(), listBroadcasts(p), withSystemTx((tx) => tx.select({ id: schema.organisations.id, name: schema.organisations.name }).from(schema.organisations).where(eq(schema.organisations.type, 'client')))]);
  return (
    <>
      <PageHeader eyebrow="Content publisher" title="Publishing" description="Homepage banner and session audiences. Every change is audited." />
      <PublishTools
        banner={banner ? { title: banner.title, body: banner.body, ctaLabel: String((banner.meta as Record<string, unknown>).ctaLabel ?? ''), ctaHref: String((banner.meta as Record<string, unknown>).ctaHref ?? '') } : null}
        broadcasts={broadcasts.map((b) => ({ id: b.id, title: b.title, description: b.description, startsAt: b.startsAt.toISOString(), status: b.status, audience: b.audience?.kind === 'tenant' ? `tenant:${b.audience.tenantId}` : b.audience?.kind ?? 'employee' }))}
        orgs={orgs}
      />
    </>
  );
}
