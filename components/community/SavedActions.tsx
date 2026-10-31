'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';

/** Small mutate-then-refresh button for the Saved & bookmarks page. */
export function SavedAction({ url, method = 'DELETE', body, label, confirmLabel }: { url: string; method?: string; body?: unknown; label: string; confirmLabel?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={busy} className="btn btn-ghost btn-sm" aria-label={confirmLabel ?? label} onClick={async () => {
        setBusy(true);
        setErr(null);
        try { await api(url, { method, body }); router.refresh(); } catch (e) { setErr(errorText(e)); setBusy(false); }
      }}>{label}</button>
      {err && <span className="error !mt-0">{err}</span>}
    </span>
  );
}
