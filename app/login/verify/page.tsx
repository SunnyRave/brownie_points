import { Logo } from '@/components/site/Logo';

export const metadata = { title: 'Confirm sign-in' };

/** Link landing page: a POST is required to consume the token, so mail scanners can't burn it. */
export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string; next?: string }> }) {
  const { token = '', next = '' } = await searchParams;
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <Logo />
      <form method="post" action="/api/auth/magic-link/consume" className="panel-glass w-full max-w-md p-8 text-center">
        <h1 className="text-2xl font-semibold">Confirm sign-in</h1>
        <p className="mt-2 text-sm text-ink-2">This single-use link expires 15 minutes after it was issued.</p>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="next" value={next} />
        <button className="btn btn-primary mt-6 w-full">Continue to azentio.ai</button>
      </form>
    </main>
  );
}
