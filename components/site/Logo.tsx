import Link from 'next/link';

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="font-display text-xl font-bold tracking-tight" aria-label="azentio.ai home">
      <span className="text-teal">a</span>zent<span className="text-teal">i</span>o<span className="text-teal">.ai</span>
    </Link>
  );
}
