import { PageHeader } from '@/components/ui';
import { OrgAdmin } from '@/components/admin/OrgAdmin';
import { requirePrincipal } from '@/lib/page';
import { overview } from '@/lib/services/admin';

export default async function AdminHome() {
  const p = await requirePrincipal();
  const d = await overview(p);
  return (
    <>
      <PageHeader eyebrow="Administration" title="Organisations & entitlements" description="Product entitlements gate client demos and sandboxes. Every change is audited." />
      <OrgAdmin orgs={d.orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug, type: o.type, members: o.members, industry: o.industry, region: o.region }))} offerings={d.offerings} entitlements={d.entitlements} />
    </>
  );
}
