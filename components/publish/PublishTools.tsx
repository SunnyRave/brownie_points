'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';

type B = { id: string; title: string; description: string; startsAt: string; status: string; audience: string };

export function PublishTools({ banner, broadcasts, orgs }: { banner: { title: string; body: string; ctaLabel: string; ctaHref: string } | null; broadcasts: B[]; orgs: { id: string; name: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); setMsg({ ok: true, text: ok }); router.refresh(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } };
  const audienceSelect = (name: string, value: string) => (
    <select name={name} defaultValue={value} className="select">
      <option value="employee">Employees only</option>
      <option value="shared_community">All client workspaces</option>
      <option value="public">Public</option>
      {orgs.map((o) => <option key={o.id} value={`tenant:${o.id}`}>Invitation-only: {o.name}</option>)}
    </select>
  );
  return (
    <div className="space-y-6">
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm text-teal' : 'error'}>{msg.text}</p>}
      <form className="panel-solid grid gap-4 p-6 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => api('/api/content/banner', { method: 'PUT', body: { title: f.get('title'), body: f.get('body'), ctaLabel: f.get('ctaLabel'), ctaHref: f.get('ctaHref') } }), 'Homepage banner updated.'); }}>
        <h2 className="font-semibold md:col-span-2">Homepage banner</h2>
        <div><label className="label" htmlFor="b-title">Title</label><input id="b-title" name="title" defaultValue={banner?.title} className="input" required /></div>
        <div><label className="label" htmlFor="b-body">Body</label><input id="b-body" name="body" defaultValue={banner?.body} className="input" /></div>
        <div><label className="label" htmlFor="b-cta">CTA label</label><input id="b-cta" name="ctaLabel" defaultValue={banner?.ctaLabel} className="input" /></div>
        <div><label className="label" htmlFor="b-href">CTA link</label><input id="b-href" name="ctaHref" defaultValue={banner?.ctaHref} className="input" /></div>
        <button className="btn btn-primary w-fit">Publish banner</button>
      </form>
      <section className="panel-solid p-6">
        <h2 className="font-semibold">Sessions & recordings</h2>
        <ul className="mt-4 space-y-4">
          {broadcasts.map((b) => (
            <li key={b.id}><form className="panel-deep grid gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => api(`/api/broadcasts/${b.id}`, { method: 'PATCH', body: { title: f.get('title'), description: b.description, startsAt: f.get('startsAt'), status: f.get('status'), audience: f.get('audience') } }), `Saved “${f.get('title')}”.`); }}>
              <input aria-label="Title" name="title" defaultValue={b.title} className="input" />
              {audienceSelect('audience', b.audience)}
              <input aria-label="Starts" name="startsAt" type="datetime-local" defaultValue={b.startsAt.slice(0, 16)} className="input" />
              <select aria-label="Status" name="status" defaultValue={b.status} className="select"><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="ended">Ended</option></select>
              <button className="btn btn-ghost btn-sm self-center">Save</button>
            </form></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
