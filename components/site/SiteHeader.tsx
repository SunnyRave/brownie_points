import Link from 'next/link';
import { Menu, Search } from 'lucide-react';
import { getPrincipal } from '@/lib/auth/session';
import { Logo } from './Logo';

const NAV = [
  ['Products', '/products'],
  ['Solutions', '/solutions'],
  ['AI Lab', '/lab'],
  ['Technology', '/technology'],
  ['Media', '/media'],
  ['Insights', '/insights'],
  ['About', '/about'],
  ['Hackathon', '/hackathon'],
] as const;

export async function SiteHeader() {
  const p = await getPrincipal();
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-8">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-5 text-sm text-ink-2 xl:flex">
          {NAV.map(([label, href]) => (
            <Link key={href} href={href} className="transition-colors hover:text-ink">{label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/search" className="btn btn-ghost btn-sm" aria-label="Search public content"><Search size={16} aria-hidden /></Link>
          <Link href={p ? '/portal' : '/login'} className="btn btn-ghost btn-sm hidden sm:inline-flex">{p ? 'Open portal' : 'Sign in'}</Link>
          <Link href="/demo" className="btn btn-primary btn-sm">Request Demo</Link>
          <details className="relative xl:hidden">
            <summary className="btn btn-ghost btn-sm list-none" aria-label="Menu"><Menu size={16} aria-hidden /></summary>
            <nav aria-label="Mobile" className="panel-solid absolute right-0 mt-2 flex w-56 flex-col p-2">
              {NAV.map(([label, href]) => (
                <Link key={href} href={href} className="rounded-xl px-3 py-3 hover:bg-surface-deep">{label}</Link>
              ))}
              <Link href={p ? '/portal' : '/login'} className="rounded-xl px-3 py-3 hover:bg-surface-deep">{p ? 'Open portal' : 'Sign in'}</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
