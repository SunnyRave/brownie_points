import { PageHeader } from '@/components/ui';
import { PeopleAdmin } from '@/components/admin/PeopleAdmin';
import { requirePrincipal } from '@/lib/page';
import { listPeople } from '@/lib/services/admin';

export default async function People() {
  const p = await requirePrincipal();
  const d = await listPeople(p);
  return (
    <>
      <PageHeader eyebrow="Administration" title="People & access" description="Employee approval comes from this allow-list (or a configured Entra group) — never from an email suffix alone." />
      <PeopleAdmin allowlist={d.allowlist.map((a) => ({ id: a.id, value: a.emailOrOid }))} pending={d.pending.map((r) => ({ id: r.id, email: r.email, name: r.name, status: r.status, createdAt: r.createdAt.toISOString() }))} />
    </>
  );
}
