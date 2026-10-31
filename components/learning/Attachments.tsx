'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Download, FileText, Lock, Paperclip, Trash2 } from 'lucide-react';
import { api, errorText } from '@/lib/client';

export type AttachmentItem = { id: string; filename: string; contentType: string; sizeBytes: number; createdAt: string; canDelete: boolean };

export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/**
 * OBS-09: private evidence files on a source record. Same audience as the record; never part of a shared copy.
 * Only the author can add/remove files, and only while the record is a draft or returned for changes.
 */
export function Attachments({ observationId, items, canUpload, limits }: { observationId: string; items: AttachmentItem[]; canUpload: boolean; limits: { maxBytes: number; maxCount: number; accept: string } }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const upload = async (file: File) => {
    setMsg(null);
    if (file.size > limits.maxBytes) return setMsg({ tone: 'err', text: `That file is ${fmtBytes(file.size)}. The limit is ${fmtBytes(limits.maxBytes)}.` });
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/observations/${observationId}/attachments`, { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw { status: res.status, ...data };
      setMsg({ tone: 'ok', text: `Attached ${file.name}.` });
      router.refresh();
    } catch (e) {
      setMsg({ tone: 'err', text: errorText(e) });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <section className="panel-solid p-6" aria-labelledby="att-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="att-h" className="flex items-center gap-2 font-semibold"><Paperclip size={16} aria-hidden /> Evidence files</h2>
        <span className="chip"><Lock size={12} aria-hidden /> Same audience as this record · never shared</span>
      </div>
      <p className="mt-1 text-xs text-ink-3">PDF, PNG, JPEG, CSV or TXT · up to {fmtBytes(limits.maxBytes)} each · max {limits.maxCount}. Files stay with this private source record and are never copied into a shared community version.</p>
      {msg && <p role={msg.tone === 'err' ? 'alert' : 'status'} className={`mt-3 rounded-xl border p-3 text-sm ${msg.tone === 'err' ? 'border-coral/40 bg-coral/10 text-coral' : 'border-teal/40 bg-teal/10 text-teal'}`}>{msg.text}</p>}
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">No files attached.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
              <span className="flex min-w-0 items-center gap-2"><FileText size={16} aria-hidden className="shrink-0 text-ink-3" /><span className="truncate">{a.filename}</span><span className="font-mono text-xs text-muted">{fmtBytes(a.sizeBytes)}</span></span>
              <span className="flex gap-2">
                <a className="btn btn-ghost btn-sm" href={`/api/attachments/${a.id}`} aria-label={`Download ${a.filename}`}><Download size={14} aria-hidden /></a>
                {a.canDelete && (
                  <button
                    className="btn btn-danger btn-sm"
                    aria-label={`Remove ${a.filename}`}
                    disabled={busy}
                    onClick={async () => {
                      if (!confirm(`Remove ${a.filename}?`)) return;
                      setMsg(null);
                      try { await api(`/api/attachments/${a.id}`, { method: 'DELETE' }); router.refresh(); } catch (e) { setMsg({ tone: 'err', text: errorText(e) }); }
                    }}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <div className="mt-4">
          <label className="label" htmlFor={`att-${observationId}`}>Add a file</label>
          <input
            ref={input}
            id={`att-${observationId}`}
            type="file"
            accept={limits.accept}
            disabled={busy}
            className="input"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
          />
          <p className="hint">Don’t attach files containing customer account numbers or personal data. Contents are checked against the file type; the name is cleaned and never used for storage.</p>
        </div>
      )}
    </section>
  );
}
