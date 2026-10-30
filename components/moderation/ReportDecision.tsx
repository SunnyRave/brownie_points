'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';

export function ReportDecision({ id, sharedStatus }: { id: string; sharedStatus: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const go = async (decision: string) => {
    try { await api(`/api/moderation/reports/${id}`, { body: { decision, note } }); setNote(''); router.refresh(); } catch (e) { setErr(errorText(e)); }
  };
  const ok = note.trim().length >= 5;
  return (
    <div className="mt-4 space-y-2">
      <label className="label" htmlFor={`note-${id}`}>Decision note (shared with the contributor)</label>
      <input id={`note-${id}`} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        {sharedStatus === 'published' && <><button disabled={!ok} className="btn btn-ghost btn-sm" onClick={() => go('unpublish')}>Temporarily unpublish</button><button disabled={!ok} className="btn btn-ghost btn-sm" onClick={() => go('dismiss')}>Dismiss</button></>}
        {sharedStatus === 'unpublished' && <button disabled={!ok} className="btn btn-ghost btn-sm" onClick={() => go('restore')}>Restore</button>}
        <button disabled={!ok} className="btn btn-danger btn-sm" onClick={() => go('remove')}>Remove</button>
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  );
}
