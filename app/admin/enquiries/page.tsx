import { Denied, PageHeader } from '@/components/ui';
import { EnquiriesAdmin } from '@/components/admin/EnquiriesAdmin';
import { requirePrincipal, guarded } from '@/lib/page';
import { listEnquiries } from '@/lib/services/enquiries';

export default async function Enquiries() {
  const p = await requirePrincipal();
  const r = await guarded(() => listEnquiries(p));
  if (!r.ok) return <Denied status={r.status} />;
  return (
    <>
      <PageHeader eyebrow="Administration" title="Enquiries" description="Demo requests and event registrations from the public site. These are real people’s contact details: visible to portal administrators only, and every change is audited." />
      <EnquiriesAdmin leads={r.data.leads} events={r.data.events} />
    </>
  );
}
