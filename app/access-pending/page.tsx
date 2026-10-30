import { redirect } from 'next/navigation';
import { Clock } from 'lucide-react';
import { Logo } from '@/components/site/Logo';
import { getPrincipal } from '@/lib/auth/session';
import { isEmployee } from '@/lib/policy/authorize';

export const dynamic = 'force-dynamic';

export default async function AccessPending() {
  const p = await getPrincipal();
  if (!p) redirect('/login');
  if (isEmployee(p)) redirect('/hub');
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div className="panel-glass max-w-lg p-8" data-persona="employee">
        <Clock className="mx-auto text-amber" size={36} aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold">Identity verified · access pending</h1>
        <p className="mt-3 text-ink-2">Signed in as <strong>{p.email}</strong>. Signing in proves who you are; portal access also needs an approved employee membership. A portal administrator has been notified.</p>
        <p className="mt-3 text-sm text-ink-3">You can’t see any portal data until access is approved.</p>
        <form method="post" action="/api/auth/signout" className="mt-6"><button className="btn btn-ghost">Sign out</button></form>
      </div>
    </main>
  );
}
