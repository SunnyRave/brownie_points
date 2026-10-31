'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';

type Action = 'approve' | 'hide' | 'remove' | 'restore' | 'dismiss';
const LABEL: Record<Action, string> = { approve: 'Approve & show', hide: 'Hide', remove: 'Remove', restore: 'Restore', dismiss: 'Dismiss report' };

/** Each decision sends an author-facing note (shown to the comment author; never an internal note). */
export function CommentDecision({ id, actions }: { id: string; actions: Action[] }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = note.trim().length >= 5;
  const go = async (action: Action) => {
    setBusy(true);
    setErr(null);
    try { await api(`/api/moderation/comments/${id}`, { body: { action, note } }); setNote(''); router.refresh(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 space-y-2">
      <label className="label" htmlFor={`cn-${id}`}>Reason shown to the comment author</label>
      <input id={`cn-${id}`} className="input" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Hidden because it named a specific client’s pricing." />
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button key={a} type="button" disabled={!ok || busy} className={`btn btn-sm ${a === 'remove' ? 'btn-danger' : a === 'approve' || a === 'restore' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => go(a)}>{LABEL[a]}</button>
        ))}
      </div>
      {err && <p className="error" role="alert">{err}</p>}
    </div>
  );
}
