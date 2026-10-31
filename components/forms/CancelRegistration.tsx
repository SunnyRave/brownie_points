'use client';
import { useState } from 'react';
import { api, errorText } from '@/lib/client';

export function CancelRegistration({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [err, setErr] = useState<string | null>(null);
  if (state === 'done') return <p className="text-teal" role="status">Your registration is cancelled. Thanks for letting us know.</p>;
  return (
    <div className="grid gap-2">
      {err && <p className="error" role="alert">{err}</p>}
      <button
        className="btn btn-danger w-fit"
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          setErr(null);
          try {
            await api('/api/events/registrations/cancel', { body: { token } });
            setState('done');
          } catch (x) {
            setErr(errorText(x));
            setState('idle');
          }
        }}
      >
        {state === 'busy' ? 'Cancelling…' : 'Cancel my registration'}
      </button>
    </div>
  );
}
