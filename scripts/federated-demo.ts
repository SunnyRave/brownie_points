/**
 * Runs one federated round end-to-end and prints a summary.
 *   PGLITE_DIR=memory:// npx tsx scripts/federated-demo.ts [--no-dropout] [--no-poison] [--no-forged] [--dp=0.5]
 * Refuses to touch a DATABASE_URL database unless --allow-remote is passed.
 */
import { eq } from 'drizzle-orm';

const args = process.argv.slice(2);
if (process.env.DATABASE_URL && !args.includes('--allow-remote')) {
  console.error('DATABASE_URL is set — refusing to write a round to a remote database. Unset it (or pass --allow-remote).');
  process.exit(1);
}

const { getDb, closeDb, withSystemTx, schema } = await import('@/lib/db');
const { executeRound } = await import('@/lib/federated/service');
const { DEFAULT_CONFIG } = await import('@/lib/federated/types');

await getDb();
const dp = Number(args.find((a) => a.startsWith('--dp='))?.slice(5) ?? 0);
const config = {
  ...DEFAULT_CONFIG,
  dpNoiseMultiplier: dp,
  scenarios: { dropout: !args.includes('--no-dropout'), poison: !args.includes('--no-poison'), forged: !args.includes('--no-forged') },
};

const { round } = await withSystemTx(async (tx) => {
  const [admin] = await tx.select().from(schema.users).where(eq(schema.users.email, 'ada.admin@azentio.com'));
  if (!admin) throw new Error('demo admin not seeded');
  return executeRound(tx, admin.id, config);
});

type M = { accuracy: number; logLoss: number; auc: number };
const m = round.metrics as Record<string, unknown> & { cohort: Record<string, number>; majorityBaseline: M; previousGlobal: M & { version: string }; global?: M; localModels: (M & { label: string; outcome: string })[]; skewNote?: string; abortReason?: string };
const fmt = (x: M) => `acc ${(x.accuracy * 100).toFixed(1)}%  log-loss ${x.logLoss.toFixed(3)}  AUC ${x.auc.toFixed(3)}`;

console.log(`\nRound ${round.roundNo} · base ${round.baseModelVersion} · ${round.aggregationMethod} · ${round.status.toUpperCase()}`);
console.log(`Scenarios: ${JSON.stringify(config.scenarios)}  DP noise multiplier: ${dp} ${dp ? '(simulated, no accounting)' : '(off)'}`);
console.log(`Cohort: ${JSON.stringify(m.cohort)}\n`);
for (const p of round.participants as { label: string; outcome: string; reasons: string[]; simulated?: string; numExamples?: number; weight?: number; updateNorm?: number }[]) {
  console.log(`  ${p.label.padEnd(20)} ${p.outcome.padEnd(9)} n=${String(p.numExamples ?? '-').padEnd(5)} w=${String(p.weight ?? '-').padEnd(7)} ‖Δ‖=${String(p.updateNorm ?? '-').padEnd(8)} ${p.simulated ? `[simulated ${p.simulated}] ` : ''}${p.reasons.join('; ')}`);
}
console.log('\nHoldout evaluation:');
console.log(`  majority baseline      ${fmt(m.majorityBaseline)}`);
console.log(`  previous global ${m.previousGlobal.version.padEnd(6)} ${fmt(m.previousGlobal)}`);
for (const l of m.localModels) console.log(`  local ${l.label.padEnd(16)} ${fmt(l)}  (${l.outcome})`);
if (m.global) console.log(`  NEW GLOBAL ${round.modelVersion.padEnd(11)} ${fmt(m.global)}  → registered as CANDIDATE (needs human approval + deployment decision)`);
else console.log(`  Round aborted: ${m.abortReason}. No model registered.`);
if (m.skewNote) console.log(`\nSkew: ${m.skewNote}`);

const leaked = JSON.stringify(round).includes('"f":[');
console.log(`\nRound record contains training examples: ${leaked ? 'YES (bug!)' : 'no'}`);

await closeDb();
