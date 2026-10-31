'use client';
import { useCallback, useEffect, useState } from 'react';
import { Bookmark, BookmarkCheck, FileSearch, Flag, MessageSquare, Save, Send, ThumbsUp } from 'lucide-react';
import { api, errorText } from '@/lib/client';
import { COMMENT_MAX, COMMENT_MIN, commentSchema, savedSearchSchema } from '@/lib/validation';

export type ItemEngagement = { useful: number; needsEvidence: number; mine: 'useful' | 'needs_evidence' | null; bookmarked: boolean; comments: number };

/** §10 quality feedback. Per-item totals only; the viewer's own vote is highlighted. No rankings anywhere. */
export function FeedbackButtons({ id, state, onChange }: { id: string; state: ItemEngagement; onChange: (s: Partial<ItemEngagement>) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const vote = async (rating: 'useful' | 'needs_evidence') => {
    setBusy(true);
    setErr(null);
    try {
      const next = await api<Omit<ItemEngagement, 'bookmarked' | 'comments'>>(`/api/community/${id}/feedback`, state.mine === rating ? { method: 'DELETE' } : { body: { rating } });
      onChange(next);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const cls = (on: boolean) => `btn btn-sm ${on ? 'btn-ghost !border-teal !text-teal' : 'btn-ghost'}`;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quality feedback">
      <button type="button" disabled={busy} aria-pressed={state.mine === 'useful'} className={cls(state.mine === 'useful')} onClick={() => vote('useful')}>
        <ThumbsUp size={13} aria-hidden /> Useful ({state.useful})
      </button>
      <button type="button" disabled={busy} aria-pressed={state.mine === 'needs_evidence'} className={cls(state.mine === 'needs_evidence')} onClick={() => vote('needs_evidence')}>
        <FileSearch size={13} aria-hidden /> Needs evidence ({state.needsEvidence})
      </button>
      {err && <span className="error !mt-0">{err}</span>}
    </div>
  );
}

export function BookmarkButton({ sourceType = 'shared_insight', id, on, onChange }: { sourceType?: 'shared_insight' | 'idea'; id: string; on: boolean; onChange: (on: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      await api('/api/bookmarks', { method: on ? 'DELETE' : 'POST', body: { sourceType, sourceId: id } });
      onChange(!on);
    } catch { /* leave state unchanged */ } finally { setBusy(false); }
  };
  return (
    <button type="button" disabled={busy} aria-pressed={on} className={`btn btn-ghost btn-sm ${on ? '!border-violet !text-violet-text' : ''}`} onClick={toggle}>
      {on ? <BookmarkCheck size={13} aria-hidden /> : <Bookmark size={13} aria-hidden />} {on ? 'Bookmarked' : 'Bookmark'}
    </button>
  );
}

type Comment = { id: string; body: string | null; createdAt: string; authorLabel: string; isMine: boolean; status: string | null };

/** Comments inherit the shared item's audience. Authors appear only as a role label. */
export function CommentThread({ id, count, onCount }: { id: string; count: number; onCount: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Comment[] | null>(null);
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setItems((await api<{ comments: Comment[] }>(`/api/community/${id}/comments`)).comments); } catch (e) { setErr(errorText(e)); }
  }, [id]);
  useEffect(() => { if (open && !items) load(); }, [open, items, load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const parsed = commentSchema.safeParse({ body });
    if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }
    try {
      const r = await api<{ held: boolean }>(`/api/community/${id}/comments`, { body: parsed.data });
      setBody('');
      setMsg(r.held ? 'Thanks — the automated check flagged possible sensitive details, so a moderator will review your comment before others can see it.' : 'Comment posted.');
      if (!r.held) onCount(count + 1);
      await load();
    } catch (x) { setErr(errorText(x)); }
  };

  return (
    <div className="mt-3 w-full">
      <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MessageSquare size={13} aria-hidden /> Comments ({count})
      </button>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl border border-line-2 p-3">
          {items?.length === 0 && <p className="text-sm text-ink-3">No comments yet.</p>}
          <ul className="space-y-3">
            {items?.map((c) => (
              <li key={c.id} className="text-sm">
                <p className="font-mono text-[11px] text-muted">{c.authorLabel} · {new Date(c.createdAt).toLocaleDateString('en-GB')}{c.status ? ` · ${c.status}` : ''}</p>
                {c.body ? <p className="mt-1 whitespace-pre-wrap text-ink-2">{c.body}</p> : <p className="mt-1 italic text-ink-3">This comment is not shown.</p>}
                {c.body && !c.isMine && !c.status && <CommentReport id={c.id} />}
              </li>
            ))}
          </ul>
          <form onSubmit={submit} className="space-y-2">
            <label htmlFor={`c-${id}`} className="label">Add a comment <span className="text-ink-3">(visible to the shared community as “Client participant” / “Azentio employee”)</span></label>
            <textarea id={`c-${id}`} className="textarea min-h-[70px]" value={body} onChange={(e) => setBody(e.target.value)} minLength={COMMENT_MIN} maxLength={COMMENT_MAX} placeholder="Share context without client names, account numbers or pricing." />
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-muted">{body.trim().length}/{COMMENT_MAX}</span>
              <button className="btn btn-primary btn-sm" disabled={body.trim().length < COMMENT_MIN}><Send size={13} aria-hidden /> Post</button>
            </div>
            {msg && <p role="status" className="text-xs text-teal">{msg}</p>}
            {err && <p className="error" role="alert">{err}</p>}
          </form>
        </div>
      )}
    </div>
  );
}

function CommentReport({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (msg) return <p className="mt-1 text-xs text-teal" role="status">{msg}</p>;
  if (!open) return <button type="button" className="mt-1 inline-flex items-center gap-1 text-xs text-ink-3 hover:text-coral" onClick={() => setOpen(true)}><Flag size={11} aria-hidden /> Report comment</button>;
  return (
    <form className="mt-2 flex flex-wrap gap-2" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      try { await api(`/api/comments/${id}/report`, { body: { reason: f.get('reason'), details: String(f.get('details') ?? '') || undefined } }); setMsg('Reported to moderators. Thank you.'); } catch (x) { setMsg(errorText(x)); }
    }}>
      <label className="sr-only" htmlFor={`cr-${id}`}>Reason</label>
      <select id={`cr-${id}`} name="reason" className="select !min-h-8 !w-auto !py-1 text-xs"><option value="misleading">Misleading</option><option value="confidential">Confidential</option><option value="inappropriate">Inappropriate</option><option value="other">Other</option></select>
      <input name="details" className="input !min-h-8 flex-1 !py-1 text-xs" placeholder="Details (optional)" maxLength={1000} />
      <button className="btn btn-danger btn-sm">Send</button>
    </form>
  );
}

/** Saves the current query + filters (never results). Running it later re-applies today's visibility and k rules. */
export function SaveSearch({ query, filters }: { query: string; filters: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setOpen(true); setMsg(null); }}><Save size={13} aria-hidden /> Save this search</button>
      {msg && <span role="status" className="text-xs text-teal">{msg}</span>}
    </span>
  );
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => {
      e.preventDefault();
      setErr(null);
      const parsed = savedSearchSchema.safeParse({ name, query, filters: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
      if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }
      try { await api('/api/saved-searches', { body: parsed.data }); setMsg('Saved. Find it under “Saved & bookmarks”.'); setOpen(false); setName(''); } catch (x) { setErr(errorText(x)); }
    }}>
      <label htmlFor="ss-name" className="sr-only">Saved search name</label>
      <input id="ss-name" className="input !min-h-9 !w-56 !py-1 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this search" maxLength={80} />
      <button className="btn btn-primary btn-sm">Save</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      {err && <span className="error !mt-0">{err}</span>}
      {msg && <span role="status" className="text-xs text-teal">{msg}</span>}
    </form>
  );
}
