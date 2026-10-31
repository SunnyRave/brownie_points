'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';
import { CATEGORY_LABELS, PRIORITY_LABELS, TICKET_CATEGORIES, TICKET_PRIORITIES, FLAG_LABELS } from './labels';

/** Raise a support ticket for the active client organisation. */
export function NewTicketForm({ base }: { base: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="panel-solid space-y-4 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        setBusy(true); setErr(null);
        try {
          const r = await api<{ ticket: { id: string }; flags: string[] }>('/api/support/tickets', { body: { subject: f.get('subject'), category: f.get('category'), priority: f.get('priority'), body: f.get('body') } });
          const q = r.flags.length ? `?flagged=${encodeURIComponent([...new Set(r.flags)].join(','))}` : '';
          router.push(`${base}/support/${r.ticket.id}${q}`);
          router.refresh();
        } catch (ex) {
          setErr(errorText(ex));
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold">New ticket</h2>
      <div><label className="label" htmlFor="t-subject">Subject</label><input id="t-subject" name="subject" required minLength={4} maxLength={160} className="input" placeholder="e.g. Colleague can’t open the SME sandbox" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="t-category">Category</label>
          <select id="t-category" name="category" className="select" defaultValue="product_question">
            {TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="t-priority">Priority</label>
          <select id="t-priority" name="priority" className="select" defaultValue="normal">
            {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="t-body">Describe the problem</label>
        <textarea id="t-body" name="body" required minLength={2} maxLength={5000} className="textarea" />
        <p className="hint">Don’t include customer account numbers, card numbers or customer names. We flag likely ones, but the check can’t guarantee privacy.</p>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send to Azentio support'}</button>
    </form>
  );
}

export function FlagNotice({ flags }: { flags: string[] }) {
  if (!flags.length) return null;
  return (
    <p role="status" className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
      Your message may contain {[...new Set(flags)].map((f) => FLAG_LABELS[f] ?? f).join(', ')}. Tickets are private to your organisation and Azentio support, but please avoid sharing customer account details. The check helps, but it can’t guarantee privacy.
    </p>
  );
}
