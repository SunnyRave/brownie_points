'use client';
import { useEffect, useState } from 'react';
import { api, errorText } from '@/lib/client';

/** Media is fetched via a 5-minute signed URL minted after a server-side access check. */
export function MediaViewer({ id, title }: { id: string; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ url: string }>(`/api/media/${id}`).then((r) => setUrl(r.url)).catch((e) => setErr(errorText(e)));
  }, [id]);
  return (
    <figure className="panel-deep overflow-hidden">
      {url ? <img src={url} alt={title} className="aspect-video w-full object-cover" /> : <div className="grid aspect-video place-items-center text-sm text-muted">{err ?? 'Loading…'}</div>}
      <figcaption className="flex items-center justify-between px-4 py-3 text-sm"><span>{title}</span><span className="font-mono text-[10px] text-muted">signed · 5 min</span></figcaption>
    </figure>
  );
}
