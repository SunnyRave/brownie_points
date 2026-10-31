import { Download, FileText, Paperclip } from 'lucide-react';

export type ModeratorAttachment = { id: string; filename: string; contentType: string; sizeBytes: number; sha256: string; createdAt: string };

const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/**
 * Presentational list of a submitted record's evidence files for the moderator.
 * Feed it `listAttachmentsForModerator(principal, observationId)`. Downloads go through
 * /api/attachments/[id]/moderator (moderator grant + moderator-mode RLS). Files are review context only:
 * they are never copied into the shared version.
 */
export function ModeratorAttachments({ items }: { items: ModeratorAttachment[] }) {
  return (
    <section className="panel-solid p-5" aria-labelledby="mod-att-h">
      <h2 id="mod-att-h" className="flex items-center gap-2 font-semibold"><Paperclip size={16} aria-hidden /> Evidence files ({items.length})</h2>
      <p className="mt-1 text-xs text-ink-3">Review context only. Attachments are never published with the shared copy.</p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">No files attached.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <FileText size={16} aria-hidden className="shrink-0 text-ink-3" />
                <span className="min-w-0">
                  <span className="block truncate">{a.filename}</span>
                  <span className="block font-mono text-[11px] text-muted">{a.contentType} · {fmtBytes(a.sizeBytes)} · sha256 {a.sha256.slice(0, 12)}…</span>
                </span>
              </span>
              <a className="btn btn-ghost btn-sm" href={`/api/attachments/${a.id}/moderator`} aria-label={`Download ${a.filename}`}><Download size={14} aria-hidden /></a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
