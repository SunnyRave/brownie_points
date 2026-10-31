'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';

const ACTIONS: Record<string, { decision: string; label: string; tone: string }[]> = {
  candidate: [{ decision: 'approve', label: 'Approve', tone: 'btn-primary' }, { decision: 'reject', label: 'Reject', tone: 'btn-danger' }],
  approved: [{ decision: 'deploy', label: 'Deploy', tone: 'btn-primary' }],
  deployed: [{ decision: 'rollback', label: 'Roll back to parent', tone: 'btn-danger' }],
};

/** Human review + explicit deployment decision. Every action needs a note and is audited server-side. */
export function ModelDecision({ id, version, status, hasParent }: { id: string; version: string; status: string; hasParent: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const actions = (ACTIONS[status] ?? []).filter((a) => a.decision !== 'rollback' || hasParent);
  if (!actions.length) return null;
  return (
    <div className="mt-3 space-y-2">
      <label className="sr-only" htmlFor={`note-${id}`}>Decision note for {version}</label>
      <input id={`note-${id}`} className="input !min-h-9 text-sm" placeholder="Decision note (required)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button key={a.decision} className={`btn btn-sm ${a.tone}`} onClick={async () => {
            setErr(null);
            try { await api(`/api/federated/models/${id}`, { body: { decision: a.decision, note } }); setNote(''); router.refresh(); } catch (e) { setErr(errorText(e)); }
          }}>{a.label}</button>
        ))}
      </div>
      {err && <p role="alert" className="text-xs text-coral">{err}</p>}
    </div>
  );
}
