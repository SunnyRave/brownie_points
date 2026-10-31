'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';
import { POST_KIND_LABELS, SPACE_STATUS_LABELS } from './labels';

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { const r = await fn(); router.refresh(); return r ?? true; } catch (e) { setErr(errorText(e)); return null; } finally { setBusy(false); }
  };
  return { busy, err, run, router };
}
const ErrorLine = ({ err }: { err: string | null }) => (err ? <p className="error" role="alert">{err}</p> : null);

export function CreateSpaceForm() {
  const { busy, err, run, router } = useRun();
  return (
    <form
      className="panel-solid space-y-3 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const r = (await run(() => api<{ id: string }>('/api/teams', { body: { name: f.get('name'), challenge: f.get('challenge') } }))) as { id: string } | null;
        if (r?.id) router.push(`/hub/teams/${r.id}`);
      }}
    >
      <h2 className="font-semibold">Start a team space</h2>
      <div><label className="label" htmlFor="ts-name">Team name</label><input id="ts-name" name="name" required minLength={3} maxLength={80} className="input" /></div>
      <div>
        <label className="label" htmlFor="ts-challenge">Challenge</label>
        <textarea id="ts-challenge" name="challenge" required minLength={10} maxLength={1000} className="textarea" placeholder="What are you building, and for which hackathon track?" />
        <p className="hint">Visible to Azentio employees only. Not indexed for public or client search, and never used by AIRA.</p>
      </div>
      <ErrorLine err={err} />
      <button className="btn btn-primary" disabled={busy}>Create space</button>
    </form>
  );
}

export function MembershipButton({ spaceId, myRole, archived }: { spaceId: string; myRole: 'owner' | 'member' | null; archived: boolean }) {
  const { busy, err, run } = useRun();
  return (
    <div>
      {myRole ? (
        <button className="btn btn-ghost" disabled={busy} onClick={() => confirm('Leave this team space?') && run(() => api(`/api/teams/${spaceId}/members`, { method: 'DELETE' }))}>Leave team</button>
      ) : (
        <button className="btn btn-primary" disabled={busy || archived} onClick={() => run(() => api(`/api/teams/${spaceId}/members`, { method: 'POST' }))}>Join team</button>
      )}
      <ErrorLine err={err} />
    </div>
  );
}

export function PostComposer({ spaceId }: { spaceId: string }) {
  const { busy, err, run } = useRun();
  const [kind, setKind] = useState<'update' | 'note' | 'link'>('update');
  const [body, setBody] = useState('');
  return (
    <form
      className="panel-solid space-y-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => api(`/api/teams/${spaceId}/posts`, { body: { kind, body } }))) setBody('');
      }}
    >
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Post type">
        {(['update', 'note', 'link'] as const).map((k) => (
          <button type="button" key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`chip ${kind === k ? 'border-accent text-accent' : ''}`}>{POST_KIND_LABELS[k]}</button>
        ))}
      </div>
      <label className="sr-only" htmlFor={`post-${spaceId}`}>Post</label>
      <textarea id={`post-${spaceId}`} className="textarea" required minLength={2} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={kind === 'link' ? 'https://… then an optional description' : 'Share progress with your team'} />
      <ErrorLine err={err} />
      <button className="btn btn-primary btn-sm" disabled={busy || body.trim().length < 2}>Post</button>
    </form>
  );
}

export function OwnerStatus({ spaceId, nextStatuses }: { spaceId: string; nextStatuses: string[] }) {
  const { busy, err, run } = useRun();
  if (!nextStatuses.length) return null;
  return (
    <div>
      <p className="label">Move to</p>
      <div className="flex flex-wrap gap-2">
        {nextStatuses.map((s) => (
          <button key={s} className={`btn btn-sm ${s === 'archived' ? 'btn-danger' : 'btn-ghost'}`} disabled={busy} onClick={() => (s !== 'archived' || confirm('Archive this space? Posting stops.')) && run(() => api(`/api/teams/${spaceId}`, { method: 'PATCH', body: { status: s } }))}>
            {SPACE_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <ErrorLine err={err} />
    </div>
  );
}

export function RemoveMemberButton({ spaceId, userId, name }: { spaceId: string; userId: string; name: string }) {
  const { busy, err, run } = useRun();
  return (
    <>
      <button className="btn btn-danger btn-sm" disabled={busy} aria-label={`Remove ${name}`} onClick={() => confirm(`Remove ${name} from the team?`) && run(() => api(`/api/teams/${spaceId}/members/${userId}`, { method: 'DELETE' }))}>Remove</button>
      <ErrorLine err={err} />
    </>
  );
}
