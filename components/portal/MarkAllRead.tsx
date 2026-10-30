'use client';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';

export function MarkAllRead() {
  const router = useRouter();
  return <button className="btn btn-ghost btn-sm" onClick={async () => { await api('/api/notifications', { method: 'POST', body: {} }); router.refresh(); }}>Mark all read</button>;
}
