import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { AiraDock } from '@/components/aira/AiraDock';
import { getPrincipal } from '@/lib/auth/session';
import { audienceKeysFor } from '@/lib/search';

export const dynamic = 'force-dynamic';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const keys = audienceKeysFor(await getPrincipal());
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <AiraDock scopeLabel={keys.includes('shared_community') ? 'public content + approved community insights' : 'public content only'} suggestions={['What does the Credit Strategy Simulator do?', 'What is RIVA?', 'How does Document Intelligence work?']} />
    </>
  );
}
