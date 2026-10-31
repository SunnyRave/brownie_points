import { kickEmailOutbox } from '@/lib/outbox';

// Without a provider key nothing is sent and emails stay "queued".
if (process.env.RESEND_API_KEY) setInterval(() => kickEmailOutbox(), 10_000).unref?.();
