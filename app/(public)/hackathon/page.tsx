import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { EventForm } from '@/components/forms/EventForm';
import { getEvent } from '@/lib/services/public-forms';

export const metadata = { title: 'Hackathon' };
export const dynamic = 'force-dynamic';

const TRACKS = [
  { title: 'Public discovery', body: 'Help visitors understand AI offerings for financial services, explore products and ask grounded questions.' },
  { title: 'Employee innovation', body: 'Prototype internal tools: guided sandboxes on synthetic data, experiments and team spaces.' },
  { title: 'Client collaboration', body: 'Turn client market observations into governed, de-identified shared learning and product improvements.' },
];

const FAQ = [
  { q: 'Do I need an account?', a: 'No. Register with your name and email. You don’t need to sign in to the portal.' },
  { q: 'Can I register as a team?', a: 'Yes. Each team member registers individually and enters the same team name.' },
  { q: 'What happens if the event is full?', a: 'You can join the waitlist. If someone cancels, the longest-waiting person gets the place automatically and is emailed.' },
  { q: 'How do I cancel?', a: 'Use the cancel link in your confirmation email. Your place then goes to the next person on the waitlist.' },
  { q: 'Who sees my details?', a: 'Only Azentio portal administrators, to run the event. Your details are not shown publicly or used for anything else.' },
];

export default async function Hackathon() {
  const ev = await getEvent('hackathon-2026');
  if (!ev) notFound();
  const full = ev.remaining === 0;
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 md:px-8">
      <PageHeader eyebrow="Event" title={ev.title} description={ev.description} />
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="panel-deep p-4"><p className="text-xs text-muted">Date</p><p className="font-display text-lg">{ev.startsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
        <div className="panel-deep p-4"><p className="text-xs text-muted">Capacity</p><p className="font-display text-lg">{ev.capacity}</p></div>
        <div className="panel-deep p-4"><p className="text-xs text-muted">Places left</p><p className="font-display text-lg text-teal">{ev.remaining}</p></div>
        <div className="panel-deep p-4"><p className="text-xs text-muted">Waitlist</p><p className="font-display text-lg">{ev.waitlisted}</p></div>
      </div>

      <section aria-labelledby="tracks-h" className="mb-10">
        <h2 id="tracks-h" className="mb-3 text-xl font-semibold">What you’ll build</h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {TRACKS.map((t) => (
            <li key={t.title} className="panel-solid p-4"><p className="font-semibold">{t.title}</p><p className="mt-1 text-sm text-ink-2">{t.body}</p></li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-3">All work uses synthetic data. No real client information is involved.</p>
      </section>

      <section aria-labelledby="reg-h" className="mb-10">
        <h2 id="reg-h" className="mb-3 text-xl font-semibold">{full ? 'The event is full: join the waitlist' : 'Register'}</h2>
        <EventForm slug={ev.slug} full={full} />
      </section>

      <section aria-labelledby="faq-h">
        <h2 id="faq-h" className="mb-3 text-xl font-semibold">Questions</h2>
        <div className="grid gap-2">
          {FAQ.map((f) => (
            <details key={f.q} className="panel-solid p-4"><summary className="cursor-pointer font-semibold">{f.q}</summary><p className="mt-2 text-sm text-ink-2">{f.a}</p></details>
          ))}
        </div>
      </section>
    </div>
  );
}
