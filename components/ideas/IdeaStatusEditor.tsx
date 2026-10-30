'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';
import { IDEA_STATUSES, IDEA_STATUS_LABELS } from '@/lib/validation';

export function IdeaStatusEditor({ id, status, publicUpdate, internalNotes }: { id: string; status: string; publicUpdate: string; internalNotes: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="panel-solid h-fit space-y-4 p-6" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      try {
        const r = await api<{ notified: number }>(`/api/ideas/${id}`, { method: 'PATCH', body: { status: f.get('status'), publicUpdate: f.get('publicUpdate'), internalNotes: f.get('internalNotes') } });
        setMsg({ ok: true, text: `Status saved and audited. ${r.notified} contributor(s) notified in-app.` });
        router.refresh();
      } catch (x) { setMsg({ ok: false, text: errorText(x) }); }
    }}>
      <h2 className="font-semibold">Update status</h2>
      <div><label className="label" htmlFor="status">Status</label><select id="status" name="status" defaultValue={status} className="select">{IDEA_STATUSES.map((s) => <option key={s} value={s}>{IDEA_STATUS_LABELS[s]}</option>)}</select></div>
      <div>
        <label className="label" htmlFor="publicUpdate">Contributor-facing update</label>
        <textarea id="publicUpdate" name="publicUpdate" className="textarea" defaultValue={publicUpdate} minLength={10} maxLength={1000} required />
        <p className="hint">Shared with contributors. Describe the theme and decision — no private source material, internal roadmap or other clients’ cases. Not a delivery commitment.</p>
      </div>
      <div className="panel-deep p-3">
        <label className="label" htmlFor="internalNotes">Internal notes (never shown to clients)</label>
        <textarea id="internalNotes" name="internalNotes" className="textarea" defaultValue={internalNotes} maxLength={4000} />
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm text-teal' : 'error'}>{msg.text}</p>}
      <button className="btn btn-primary w-full">Save status</button>
    </form>
  );
}
