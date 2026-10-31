/**
 * Builds the weekly theme digests (in-app notification per subscriber; email queued in the outbox only).
 * Idempotent per user per ISO week. Usage: npm run digest [-- --since-days=7]
 */
export {};
process.env.AUTO_SEED ??= '0';
const { buildDigests } = await import('@/lib/services/digests');
const { closeDb } = await import('@/lib/db');

const arg = process.argv.find((a) => a.startsWith('--since-days='));
const days = Math.min(90, Math.max(1, Number(arg?.split('=')[1] ?? 7) || 7));
try {
  const r = await buildDigests(new Date(Date.now() - days * 86400_000));
  console.log(`Digest ${r.week}: ${r.notified} in-app notification(s), ${r.emailsQueued} email(s) queued (not sent), ${r.skipped} skipped.`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await closeDb();
}
