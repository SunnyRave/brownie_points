'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  const activeHref = items.map((i) => i.href).filter((h) => path === h || path.startsWith(`${h}/`)).sort((a, b) => b.length - a.length)[0];
  return (
    <ul className="flex gap-1 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
      {items.map((i) => {
        const active = i.href === activeHref;
        return (
          <li key={i.href}>
            <Link href={i.href} aria-current={active ? 'page' : undefined} className={`block whitespace-nowrap rounded-xl px-3 py-2.5 text-sm transition-colors ${active ? 'bg-surface text-ink shadow-[inset_3px_0_0_var(--accent)]' : 'text-ink-3 hover:bg-surface/60 hover:text-ink'}`}>
              {i.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
