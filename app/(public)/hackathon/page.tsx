import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { EventForm } from '@/components/forms/EventForm';
import { getEvent } from '@/lib/services/public-forms';

export const metadata = { title: 'Hackathon' };
export default async function Hackathon() {
  const ev = await getEvent('hackathon-2026');
  if (!ev) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 md:px-8">
      <PageHeader eyebrow="Event" title={ev.title} description={ev.description} />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="panel-deep p-4"><p className="text-xs text-muted">Date</p><p className="font-display text-lg">{ev.startsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
        <div className="panel-deep p-4"><p className="text-xs text-muted">Capacity</p><p className="font-display text-lg">{ev.capacity}</p></div>
        <div className="panel-deep p-4"><p className="text-xs text-muted">Places left</p><p className="font-display text-lg text-teal">{ev.remaining}</p></div>
      </div>
      <EventForm slug={ev.slug} full={ev.remaining === 0} />
    </div>
  );
}
