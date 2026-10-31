'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';
import { FLAG_LABELS, STATUS_LABELS, TICKET_STATUSES, type TicketStatus } from './labels';

/** Client reply + close (side='client') or support-desk reply + status (side='azentio'). */
export function ReplyBox({ ticketId, side, status }: { ticketId: string; side: 'client' | 'azentio'; status: TicketStatus }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [next, setNext] = useState<TicketStatus>(status === 'closed' ? 'closed' : 'waiting_on_client');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const base = side === 'client' ? `/api/support/tickets/${ticketId}` : `/api/support/desk/${ticketId}`;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null);
    try {
      const r = (await fn()) as { flags?: string[] } | undefined;
      if (r?.flags?.length) setMsg({ tone: 'warn', text: `Sent. It may contain ${[...new Set(r.flags)].map((f) => FLAG_LABELS[f] ?? f).join(', ')} — please avoid sharing customer account details.` });
      else setMsg({ tone: 'ok', text: ok });
      router.refresh();
      return true;
    } catch (e) {
      setMsg({ tone: 'err', text: errorText(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const closed = status === 'closed';
  const tone = msg?.tone === 'err' ? 'border-coral/40 bg-coral/10 text-coral' : msg?.tone === 'warn' ? 'border-amber/40 bg-amber/10 text-amber' : 'border-teal/40 bg-teal/10 text-teal';

  return (
    <section className="panel-solid space-y-3 p-5">
      {msg && <p role={msg.tone === 'err' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${tone}`}>{msg.text}</p>}
      {side === 'client' && closed ? (
        <p className="text-sm text-ink-3">This ticket is closed. Open a new ticket if you still need help.</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => api(`${base}/messages`, { body: side === 'client' ? { body } : { body, status: next } }), 'Reply sent.');
            if (ok) setBody('');
          }}
        >
          <label className="label" htmlFor="reply-body">{side === 'client' ? 'Reply to Azentio support' : 'Reply to the client'}</label>
          <textarea id="reply-body" className="textarea" required minLength={2} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex flex-wrap items-end gap-3">
            {side === 'azentio' && (
              <div>
                <label className="label" htmlFor="reply-status">Then set status</label>
                <select id="reply-status" className="select !w-auto" value={next} onChange={(e) => setNext(e.target.value as TicketStatus)}>
                  {TICKET_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
            )}
            <button className="btn btn-primary" disabled={busy || body.trim().length < 2}>Send reply</button>
          </div>
        </form>
      )}
      {side === 'client' && !closed && (
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => confirm('Close this ticket? You can open a new one later.') && run(() => api(base, { method: 'PATCH', body: { action: 'close' } }), 'Ticket closed.')}>
          Close ticket
        </button>
      )}
    </section>
  );
}

/** Desk-only quick status change (every change is audited and notifies the client who raised the ticket). */
export function DeskStatusSelect({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <label className="label" htmlFor="desk-status">Status</label>
      <select
        id="desk-status"
        className="select"
        defaultValue={status}
        onChange={async (e) => {
          setErr(null);
          try { await api(`/api/support/desk/${ticketId}`, { method: 'PATCH', body: { status: e.target.value } }); router.refresh(); } catch (ex) { setErr(errorText(ex)); }
        }}
      >
        {TICKET_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
      </select>
      {err && <p className="error" role="alert">{err}</p>}
      <p className="hint">Changes are audited and the client is notified.</p>
    </div>
  );
}
