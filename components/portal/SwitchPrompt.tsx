'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';

export function SwitchPrompt({ orgId, orgName }: { orgId: string; orgName: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <main id="main" className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center" data-persona="client">
      <h1 className="text-2xl font-semibold">Switch workspace?</h1>
      <p className="text-ink-2">You’re a member of <strong>{orgName}</strong>, but it isn’t your active workspace. Switching changes what this session can see.</p>
      <div className="flex gap-3">
        <button className="btn btn-primary" onClick={async () => { try { await api('/api/session/workspace', { body: { orgId } }); router.refresh(); } catch (e) { setErr(errorText(e)); } }}>Switch to {orgName}</button>
        <a className="btn btn-ghost" href="/portal">Cancel</a>
      </div>
      {err && <p className="error">{err}</p>}
    </main>
  );
}
