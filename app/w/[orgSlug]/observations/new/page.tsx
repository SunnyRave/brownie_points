import { PageHeader } from '@/components/ui';
import { Composer } from '@/components/learning/Composer';
import { allOfferings } from '@/lib/services/workspace';

export default async function NewObservation({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const offerings = await allOfferings();
  return (
    <>
      <PageHeader eyebrow="New contribution" title="Write an observation" description="This starts as a private draft that only you can see." />
      <Composer base={`/w/${orgSlug}`} offerings={offerings} />
    </>
  );
}
