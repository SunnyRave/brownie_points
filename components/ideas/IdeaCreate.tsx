'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';
import type { SharedInsightDTO } from '@/lib/learning/dto';

export function IdeaCreate({ evidence, offerings }: { evidence: SharedInsightDTO[]; offerings: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <button className="btn btn-primary" onClick={() => setOpen(true)}>New improvement idea</button>;
  return (
    <form className="panel-solid grid gap-4 p-6 md:grid-cols-2" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      try {
        const r = await api<{ id: string }>('/api/ideas', { body: { title: f.get('title'), problem: f.get('problem'), offeringId: f.get('offeringId') || null, proposedOutcome: f.get('proposedOutcome'), ownerTeam: f.get('ownerTeam'), priority: f.get('priority'), evidenceIds: picked } });
        router.push(`/hub/ideas/${r.id}`);
      } catch (x) { setErr(errorText(x)); }
    }}>
      <div className="md:col-span-2"><label className="label" htmlFor="title">Title</label><input id="title" name="title" className="input" required minLength={8} maxLength={140} defaultValue="Seasonality-aware comparison explanation" /></div>
      <div className="md:col-span-2"><label className="label" htmlFor="problem">Problem statement</label><textarea id="problem" name="problem" className="textarea" required minLength={20} defaultValue="Seasonal SMEs are compared against naive annualised baselines, producing inconsistent assessments across quarters." /></div>
      <div><label className="label" htmlFor="offeringId">Offering</label><select id="offeringId" name="offeringId" className="select">{offerings.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
      <div><label className="label" htmlFor="ownerTeam">Owner / team</label><input id="ownerTeam" name="ownerTeam" className="input" required defaultValue="Financial Analysis Intelligence squad" /></div>
      <div className="md:col-span-2"><label className="label" htmlFor="proposedOutcome">Proposed outcome</label><textarea id="proposedOutcome" name="proposedOutcome" className="textarea" required minLength={10} defaultValue="Explain comparisons against a seasonality-aware baseline alongside the naive view." /></div>
      <div><label className="label" htmlFor="priority">Priority (internal)</label><select id="priority" name="priority" className="select" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
      <fieldset className="md:col-span-2">
        <legend className="label">Supporting evidence — approved shared contributions only</legend>
        <ul className="grid max-h-72 gap-2 overflow-y-auto md:grid-cols-2">
          {evidence.map((e) => (
            <li key={e.id}><label className="panel-glass flex cursor-pointer items-start gap-3 p-3 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--amber)]" checked={picked.includes(e.id)} onChange={(x) => setPicked(x.target.checked ? [...picked, e.id] : picked.filter((p) => p !== e.id))} />
              <span><span className="font-medium">{e.title}</span><span className="block font-mono text-[11px] text-muted">{e.topic} · {e.region} · {e.period}</span></span>
            </label></li>
          ))}
        </ul>
      </fieldset>
      {err && <p className="error md:col-span-2" role="alert">{err}</p>}
      <div className="flex gap-3 md:col-span-2"><button className="btn btn-primary">Create idea (Proposed)</button><button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}
