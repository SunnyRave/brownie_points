import { LoginPanel } from '@/components/forms/LoginPanel';
import { LoginOrbit } from '@/components/forms/LoginOrbit';
import { Logo } from '@/components/site/Logo';
import { getAuthMethods, isDemoMode, microsoftConfigured } from '@/lib/settings';
import { DEMO_USERS } from '@/scripts/seed-data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = {
  tenant_mismatch: 'That Microsoft account belongs to a different organisation. Sign in with your Azentio work account.',
  issuer_mismatch: 'That Microsoft account could not be verified for Azentio.',
  oidc_state: 'The sign-in request expired or was tampered with. Please try again.',
  microsoft_failed: 'Microsoft sign-in failed. Please try again.',
  microsoft_disabled: 'Microsoft sign-in is not enabled in this environment.',
  link_invalid: 'That sign-in link is invalid, expired or already used. Request a new one.',
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; as?: string; signed_out?: string }> }) {
  const sp = await searchParams;
  const methods = await getAuthMethods();
  const personas = isDemoMode()
    ? [
        { group: 'Azentio', label: 'Employee', email: DEMO_USERS.employee, tone: 'amber' },
        { group: 'Azentio', label: 'Publisher', email: DEMO_USERS.publisher, tone: 'amber' },
        { group: 'Azentio', label: 'Moderator', email: DEMO_USERS.moderator, tone: 'coral' },
        { group: 'Azentio', label: 'Product owner', email: DEMO_USERS.owner, tone: 'amber' },
        { group: 'Azentio', label: 'Portal admin', email: DEMO_USERS.admin, tone: 'teal' },
        { group: 'Clients', label: 'Northwind admin', email: DEMO_USERS.northwindAdmin, tone: 'violet' },
        { group: 'Clients', label: 'Northwind member', email: DEMO_USERS.northwindMember, tone: 'violet' },
        { group: 'Clients', label: 'Harbor member', email: DEMO_USERS.harborMember, tone: 'violet' },
        { group: 'Clients', label: 'Meridian member', email: DEMO_USERS.meridianMember, tone: 'violet' },
        { group: 'Clients', label: 'Consultant (2 orgs)', email: DEMO_USERS.consultant, tone: 'violet' },
      ]
    : [];
  return (
    <main id="main" className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line/60 p-10 lg:flex">
        <Logo />
        <div>
          <LoginOrbit />
          <h1 className="mt-8 text-4xl font-bold">One portal. Three private worlds.</h1>
          <p className="mt-3 max-w-md text-ink-2">Employees, clients and the public each see exactly what they’re permitted to — decided on the server, every request.</p>
          <ul className="mt-6 flex flex-wrap gap-2">
            <li className="chip border-teal/40 text-teal">Public</li>
            <li className="chip border-amber/40 text-amber">Employee</li>
            <li className="chip border-violet/40 text-violet-text">Client</li>
            <li className="chip border-coral/40 text-coral">Moderator</li>
          </ul>
        </div>
        <p className="text-xs text-muted">Joining a workspace never means sharing your data.</p>
      </section>
      <section className="flex flex-col items-center justify-center gap-6 p-4 py-10 md:p-10">
        <div className="lg:hidden"><Logo /></div>
        {sp.signed_out && <p role="status" className="chip border-teal/40 text-teal">You’ve been signed out.</p>}
        {sp.error && <p role="alert" className="max-w-md rounded-xl border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{ERRORS[sp.error] ?? 'Sign-in failed.'}</p>}
        <LoginPanel
          initialTab={sp.as === 'client' ? 'client' : 'employee'}
          microsoft={methods.includes('microsoft')}
          microsoftConfigured={microsoftConfigured()}
          magicLink={methods.includes('magiclink')}
          personas={personas}
        />
        <p className="text-center text-xs text-muted lg:hidden">Joining a workspace never means sharing your data.</p>
      </section>
    </main>
  );
}
