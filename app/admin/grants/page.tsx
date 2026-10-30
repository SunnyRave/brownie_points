import { PageHeader } from '@/components/ui';
import { GrantsAdmin } from '@/components/admin/GrantsAdmin';
import { requirePrincipal } from '@/lib/page';
import { listGrants, overview } from '@/lib/services/admin';

export default async function Grants() {
  const p = await requirePrincipal();
  const [grants, d] = await Promise.all([listGrants(p), overview(p)]);
  const orgName = new Map(d.orgs.map((o) => [o.id, o.name]));
  return (
    <>
      <PageHeader eyebrow="Administration" title="Grants" description="Moderate, publish, product-owner and admin rights are separate grants with a reason. Assigning or revoking signs the user out so it applies immediately." />
      <GrantsAdmin
        grants={grants.map((g) => ({ id: g.id, grant: g.grant, email: g.email, name: g.name, scope: g.scopeOrgId ? orgName.get(g.scopeOrgId) ?? g.scopeOrgId : g.scopeIdeaId ? `idea ${g.scopeIdeaId.slice(0, 8)}` : 'platform', expiresAt: g.expiresAt?.toISOString() ?? null, reason: g.reason, scopeOrgId: g.scopeOrgId }))}
        orgs={d.orgs.filter((o) => o.type === 'client').map((o) => ({ id: o.id, name: o.name }))}
        selfEmail={p.email}
      />
    </>
  );
}
