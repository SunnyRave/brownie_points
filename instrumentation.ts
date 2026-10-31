/** Starts the email outbox worker with the Node server (see instrumentation-node.ts). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
