import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { CancelRegistration } from '@/components/forms/CancelRegistration';
import { guarded } from '@/lib/page';
import { lookupCancellation } from '@/lib/services/public-forms';

export const metadata = { title: 'Cancel registration' };
export const dynamic = 'force-dynamic';

/** Opening the emailed link only shows the registration; cancelling needs a button press. */
export default async function CancelPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const r = token ? await guarded(() => lookupCancellation(token)) : null;
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 md:px-8">
      <PageHeader eyebrow="Event" title="Cancel your registration" />
      {!r || !r.ok ? (
        <div className="panel-solid p-6">
          <p>This link isn’t valid. Use the link from your confirmation email, or register again on the <Link href="/hackathon">hackathon page</Link>.</p>
        </div>
      ) : r.data.status === 'cancelled' ? (
        <div className="panel-solid p-6" role="status"><p>Your registration for <strong>{r.data.eventTitle}</strong> is already cancelled.</p></div>
      ) : (
        <div className="panel-solid grid gap-4 p-6">
          <p><strong>{r.data.name}</strong>, you’re {r.data.status === 'waitlisted' ? 'on the waitlist' : 'registered'} for <strong>{r.data.eventTitle}</strong> on {new Date(r.data.startsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
          <p className="font-mono text-sm text-muted">Confirmation {r.data.confirmation}</p>
          <p className="text-sm text-ink-3">{r.data.status === 'registered' ? 'If you cancel, your place goes to the next person on the waitlist.' : 'Cancelling removes you from the waitlist.'} You can register again later if places are available.</p>
          <CancelRegistration token={token!} />
        </div>
      )}
    </div>
  );
}
