import Link from 'next/link';
import { Bell, LogOut } from 'lucide-react';
import { Logo } from '@/components/site/Logo';
import { AiraDock } from '@/components/aira/AiraDock';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { NavLinks } from './NavLinks';
import { unreadCount } from '@/lib/services/notifications';
import { hasGrant, isEmployee } from '@/lib/policy/authorize';
import type { Principal } from '@/lib/policy/types';

export type NavItem = { href: string; label: string };
type Persona = 'employee' | 'client' | 'moderator' | 'admin';
const PERSONA_LABEL: Record<Persona, string> = { employee: 'Employee hub', client: 'Client workspace', moderator: 'Moderation', admin: 'Administration' };

export async function PortalShell({ principal, persona, nav, activeLabel, children }: { principal: Principal; persona: Persona; nav: NavItem[]; activeLabel: string; children: React.ReactNode }) {
  const unread = await unreadCount(principal);
  const options: { orgId: string; name: string; slug: string; kind: 'client' | 'azentio' }[] = principal.memberships
    .filter((m) => m.status === 'active')
    .map((m) => ({ orgId: m.orgId, name: m.orgType === 'azentio' ? 'Azentio employee hub' : m.orgName, slug: m.orgSlug, kind: m.orgType }));
  const extra: NavItem[] = [];
  if (persona !== 'moderator' && hasGrant(principal, 'moderator')) extra.push({ href: '/moderate', label: 'Moderation ↗' });
  if (persona !== 'admin' && hasGrant(principal, 'portal_admin')) extra.push({ href: '/admin', label: 'Administration ↗' });
  if (persona !== 'employee' && isEmployee(principal)) extra.push({ href: '/hub', label: 'Employee hub ↗' });
  return (
    <div data-persona={persona} className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Logo href="/portal" />
            <span className="eyebrow hidden md:inline">{PERSONA_LABEL[persona]}</span>
          </div>
          <div className="flex items-center gap-2">
            <WorkspaceSwitcher active={activeLabel} options={options} />
            <Link href="/notifications" className="btn btn-ghost btn-sm relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
              <Bell size={16} aria-hidden />
              {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 font-mono text-[10px] text-[#04121a]">{unread}</span>}
            </Link>
            <form method="post" action="/api/auth/signout"><button className="btn btn-ghost btn-sm" aria-label="Sign out"><LogOut size={16} aria-hidden /></button></form>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 md:grid-cols-[220px_1fr] md:px-6">
        <aside>
          <nav aria-label={PERSONA_LABEL[persona]} className="md:sticky md:top-24">
            <NavLinks items={[...nav, ...extra]} />
            <div className="mt-6 hidden rounded-2xl border border-line p-3 text-xs text-ink-3 md:block">
              <p className="font-semibold text-ink-2">{principal.name}</p>
              <p className="truncate">{principal.email}</p>
              <p className="mt-2 font-mono text-[10px] text-muted">{principal.authMethod === 'microsoft' ? 'Microsoft Entra ID' : 'Email link'} · {principal.amr.includes('mfa') ? 'MFA' : 'no MFA claim'}</p>
            </div>
          </nav>
        </aside>
        <main id="main" className="min-w-0">{children}</main>
      </div>
      <AiraDock scopeLabel={persona === 'client' ? 'public content + approved community insights' : 'public, community and employee-only sources'} suggestions={['What themes mention seasonality?', 'Summarise document upload friction']} />
    </div>
  );
}
