'use client';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';

export function DeleteDraft({ id, back }: { id: string; back: string }) {
  const router = useRouter();
  return <button className="btn btn-danger" onClick={async () => { if (!confirm('Delete this private draft?')) return; await api(`/api/observations/${id}`, { method: 'DELETE' }); router.push(back); router.refresh(); }}>Delete draft</button>;
}
