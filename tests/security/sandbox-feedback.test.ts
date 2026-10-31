import { beforeAll, describe, expect, it } from 'vitest';
import { db, expectHttp, loginAs } from '../helpers';
import { DEMO_USERS as U } from '@/scripts/seed-data';

let play: typeof import('@/lib/services/playground');

beforeAll(async () => {
  await db();
  play = await import('@/lib/services/playground');
});

describe('sandbox feedback loop', () => {
  it('product owner sees de-identified feedback grouped by scenario; sensitive comments withheld', async () => {
    const nw = await loginAs(U.northwindMember, 'northwind');
    const a = await play.runScenario(nw, 'client', { scenarioId: 'seasonal-sme', inputs: {} });
    await play.recordFeedback(nw, a.runId, { useful: 'partly', clarity: 4, comment: 'Seasonal explanation was clear but we want peer comparisons.' });
    const b = await play.runScenario(nw, 'client', { scenarioId: 'seasonal-sme', inputs: {} });
    await play.recordFeedback(nw, b.runId, { useful: 'yes', clarity: 2, comment: 'Like our account 44120987 case last week.' });
    const emp = await loginAs(U.employee);
    const c = await play.runScenario(emp, 'employee', { scenarioId: 'seasonal-sme', inputs: {} });
    await play.recordFeedback(emp, c.runId, { useful: 'no', clarity: 3 });

    const summary = await play.sandboxFeedbackSummary(await loginAs(U.owner));
    const g = summary.find((x) => x.scenarioId === 'seasonal-sme')!;
    expect(g.responses).toBeGreaterThanOrEqual(3);
    expect(g.useful.partly + g.useful.yes + g.useful.no).toBe(g.responses);
    expect(g.comments.some((x) => x.text?.includes('peer comparisons') && x.source === 'Client')).toBe(true);
    expect(g.comments.some((x) => x.withheld && x.text === null)).toBe(true);

    const json = JSON.stringify(summary);
    for (const leak of ['44120987', nw.userId, nw.activeTenantId!, U.northwindMember, 'Northwind', a.runId]) expect(json).not.toContain(leak);
  });

  it('only product owners can open it', async () => {
    await expectHttp(play.sandboxFeedbackSummary(null), 401);
    for (const p of [await loginAs(U.employee), await loginAs(U.moderator), await loginAs(U.northwindAdmin, 'northwind')]) {
      await expectHttp(play.sandboxFeedbackSummary(p), 403);
    }
  });

  it('a user cannot leave feedback on someone else’s run', async () => {
    const nw = await loginAs(U.northwindMember, 'northwind');
    const run = await play.runScenario(nw, 'client', { scenarioId: 'seasonal-sme', inputs: {} });
    const hb = await loginAs(U.harborMember, 'harbor');
    await expectHttp(play.recordFeedback(hb, run.runId, { useful: 'no', clarity: 1 }), 404);
    const nina = await loginAs(U.northwindAdmin, 'northwind');
    await expectHttp(play.recordFeedback(nina, run.runId, { useful: 'no', clarity: 1 }), 404);
  });
});
