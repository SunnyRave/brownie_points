import { Info } from 'lucide-react';

/** Honest labelling for every assisted output: what produced it and what it does not mean. */
export function MethodNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="note" className="flex items-start gap-2 rounded-xl border border-line-2 px-3 py-2 text-xs text-ink-3">
      <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
