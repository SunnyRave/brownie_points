import { Logo } from '@/components/site/Logo';
import { InviteFlow } from '@/components/forms/InviteFlow';
import { getInvitationByToken } from '@/lib/auth/invitations';
import { getPrincipal } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Workspace invitation' };

const ROLE: Record<string, string> = { client_member: 'Member', client_admin: 'Administrator' };

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [inv, p] = await Promise.all([getInvitationByToken(token), getPrincipal()]);
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10" data-persona="client">
      <Logo />
      <div className="panel-glass w-full max-w-xl p-8">
        {!inv || inv.state !== 'valid' ? (
          <>
            <h1 className="text-2xl font-semibold">This invitation can’t be used</h1>
            <p className="mt-2 text-ink-2">{!inv ? 'The link is not valid.' : inv.state === 'expired' ? 'It has expired (invitations last 7 days).' : inv.state === 'used' ? 'It has already been used.' : 'It was revoked.'} Ask your organisation’s administrator for a new invitation.</p>
          </>
        ) : (
          <>
            <p className="eyebrow">Invitation</p>
            <h1 className="mt-2 text-2xl font-semibold">Join {inv.orgName}</h1>
            <p className="mt-2 text-ink-2">Proposed role: <strong>{ROLE[inv.proposedRole]}</strong>. This invitation is for <strong>{inv.email.replace(/^(.).*(@.*)$/, '$1•••$2')}</strong> and can only be accepted by that verified address.</p>
            <InviteFlow token={token} signedInEmail={p?.email ?? null} emailMatches={!!p && p.email.toLowerCase() === inv.email.toLowerCase()} />
          </>
        )}
      </div>
    </main>
  );
}
