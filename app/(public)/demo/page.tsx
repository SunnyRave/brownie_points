import { PageHeader } from '@/components/ui';
import { DemoForm } from '@/components/forms/DemoForm';
import { listOfferings } from '@/lib/services/content';

export const metadata = { title: 'Request a demo' };
export default async function Demo() {
  const offerings = await listOfferings(null);
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 md:px-8">
      <PageHeader eyebrow="Demo" title="Request a demo" description="Tell us what you’d like to see. Demos use synthetic data only." />
      <DemoForm offerings={offerings.map((o) => ({ id: o.id, name: o.name }))} />
    </div>
  );
}
