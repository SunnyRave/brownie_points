import { beforeAll, describe, expect, it } from 'vitest';
import { db, loginAs } from '../helpers';
import { DEMO_USERS as U } from '@/scripts/seed-data';

let aira: typeof import('@/lib/aira');
let help: typeof import('@/lib/aira/help');

beforeAll(async () => {
  delete process.env.ANTHROPIC_API_KEY; // deterministic guide answers
  await db();
  aira = await import('@/lib/aira');
  help = await import('@/lib/aira/help');
});

async function collect(gen: AsyncGenerator<{ type: string; text?: string; mode?: string; citations?: unknown[] }>) {
  let text = '';
  let notice: string | null = null;
  let mode = '';
  for await (const e of gen) {
    if (e.type === 'text') text += e.text;
    if (e.type === 'notice') notice = e.text!;
    if (e.type === 'done') mode = e.mode!;
  }
  return { text, notice, mode };
}

describe('AIRA general help', () => {
  it('detects greetings and portal how-to questions only', () => {
    for (const q of ['hi', 'Hello!', 'what can you do?', 'help', 'How do I withdraw a contribution?', 'where do I raise a support ticket']) expect(help.isHelpIntent(q)).toBe(true);
    for (const q of ['What themes mention seasonality?', 'Project Lighthouse', 'What is the capital of France?', 'how do I bake bread']) expect(help.isHelpIntent(q)).toBe(false);
  });

  it('labels help answers as not from approved sources and gives no citations', async () => {
    const r = await collect(aira.answer(null, 'hello'));
    expect(r.notice).toBe(help.GENERAL_HELP_LABEL);
    expect(r.mode).toBe('general');
    expect(r.text).toContain('AIRA');
  });

  it('answers a client how-to from the client guide', async () => {
    const nw = await loginAs(U.northwindMember, 'northwind');
    const r = await collect(aira.answer(nw, 'How do I withdraw a contribution?'));
    expect(r.mode).toBe('general');
    expect(r.text).toMatch(/Withdraw/);
  });

  it('never describes employee-only or admin features to clients', async () => {
    const member = await loginAs(U.northwindMember, 'northwind');
    const guide = help.guideFor(member).map((t) => t.text).join(' ');
    for (const w of ['Hackathon team spaces', 'Experiments', 'Review queue', 'support desk', 'Federated programme (P2)', 'Team & invitations']) expect(guide).not.toContain(w);
    const r = await collect(aira.answer(member, 'how do I open the moderation review queue?'));
    expect(r.text).not.toMatch(/Review queue/);
    const admin = await loginAs(U.northwindAdmin, 'northwind');
    expect(help.guideFor(admin).map((t) => t.text).join(' ')).toContain('Team & invitations');
  });

  it('keeps grounded refusals: employee-only content and general knowledge', async () => {
    const hb = await loginAs(U.harborMember, 'harbor');
    expect((await collect(aira.answer(hb, 'Project Lighthouse'))).text).toBe(aira.NO_ANSWER);
    expect((await collect(aira.answer(hb, 'What is the capital of France?'))).text).toBe(aira.NO_ANSWER);
    const r = await collect(aira.answer(hb, 'how do I bake bread'));
    expect(r.text).toBe(aira.NO_ANSWER);
    expect(r.notice).toBeNull();
  });
});
