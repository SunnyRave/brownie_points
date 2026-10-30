import Link from 'next/link';
import { Logo } from './Logo';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-4 md:px-8">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-ink-3">Build Intelligence. Create Impact.</p>
          <p className="mt-4 font-mono text-xs text-muted">© 2026 azentio.ai · Product information is indicative and subject to validation. Portal demo data (client organisations, people, observations) is synthetic.</p>
        </div>
        <div className="text-sm">
          <p className="mb-3 font-semibold">Explore</p>
          <ul className="space-y-2 text-ink-3">
            <li><Link href="/products">Products</Link></li>
            <li><Link href="/solutions">Solutions</Link></li>
            <li><Link href="/lab">AI Lab</Link></li>
            <li><Link href="/technology">Technology</Link></li>
            <li><Link href="/media">Media</Link></li>
            <li><Link href="/insights">Insights</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="mb-3 font-semibold">Portal</p>
          <ul className="space-y-2 text-ink-3">
            <li><Link href="/login">Employee sign-in</Link></li>
            <li><Link href="/login?as=client">Client sign-in</Link></li>
            <li><Link href="/demo">Request a demo</Link></li>
            <li><Link href="/hackathon">Hackathon</Link></li>
            <li><Link href="/about">About</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
