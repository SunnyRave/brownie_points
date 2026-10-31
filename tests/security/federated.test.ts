import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, expectHttp, loginAs } from '../helpers';
import { DEMO_USERS as U } from '@/scripts/seed-data';

process.env.FL_STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-sec-'));

let fl: typeof import('@/lib/federated/service');
let client: typeof import('@/lib/federated/client');
let D: Awaited<ReturnType<typeof db>>;

beforeAll(async () => {
  D = await db();
  fl = await import('@/lib/federated/service');
  client = await import('@/lib/federated/client');
});

const models = () => D.withSystemTx((tx) => tx.select().from(D.schema.flModels));
const byVersion = async (v: string) => (await models()).find((m) => m.version === v)!;

describe('federated programme access control', () => {
  it('employees read pseudonymised data; only portal admins run rounds or see the org mapping', async () => {
    const emp = await loginAs(U.employee);
    const view = await fl.getProgramme(emp);
    expect(view.isAdmin).toBe(false);
    expect(view.participants.length).toBeGreaterThanOrEqual(4);
    expect(view.participants.every((p) => !('orgName' in p) && !('consentedBy' in p))).toBe(true);
    expect(JSON.stringify(view)).not.toContain('Northwind');
    await expectHttp(fl.runRound(emp, {}), 403, 'missing_grant');
    await expectHttp(fl.runRound(await loginAs(U.moderator), {}), 403);
    const someModel = view.models[0];
    await expectHttp(fl.decideModel(emp, someModel.id, { decision: 'approve', note: 'not allowed here' }), 403);

    const admin = await fl.getProgramme(await loginAs(U.admin));
    expect(admin.isAdmin).toBe(true);
    expect(admin.participants.some((p) => 'orgName' in p && p.orgName === 'Northwind Bank')).toBe(true);
  });

  it('clients cannot read the programme; only a client admin manages their own enrolment', async () => {
    await expectHttp(fl.getProgramme(await loginAs(U.northwindMember, 'northwind')), 403, 'audience_mismatch');
    await expectHttp(fl.getProgramme(await loginAs(U.northwindAdmin, 'northwind')), 403);
    await expectHttp(fl.enrol(await loginAs(U.meridianMember, 'meridian'), { consent: true, consentVersion: 'fl-consent/2026-10' }), 403, 'missing_grant');
    await expectHttp(fl.getMyEnrolment(await loginAs(U.employee)), 403);
    const mine = await fl.getMyEnrolment(await loginAs(U.northwindAdmin, 'northwind'));
    expect(mine.status).toBe('enrolled');
    expect(JSON.stringify(mine)).not.toMatch(/Harbor|Cedar|Atlas/);
  });

  it('enrolment requires explicit programme consent (membership is not consent)', async () => {
    const mia = await loginAs(U.meridianAdmin, 'meridian');
    expect((await fl.getMyEnrolment(mia)).status).toBe('not_enrolled');
    // Schema errors become HTTP 400 in route handlers.
    await expect(fl.enrol(mia, {})).rejects.toThrow(/consent/i);
    await expect(fl.enrol(mia, { consent: true, consentVersion: 'old' })).rejects.toThrow();
    expect((await fl.getMyEnrolment(mia)).status).toBe('not_enrolled');
  });
});

describe('federated data minimisation', () => {
  it('round rows and coordinator payloads contain no training examples', async () => {
    const [rounds, parts] = await D.withSystemTx(async (tx) => [await tx.select().from(D.schema.flRounds), await tx.select().from(D.schema.flParticipants)] as const);
    expect(rounds.length).toBeGreaterThanOrEqual(3);
    const blob = JSON.stringify(rounds) + JSON.stringify(await models());
    expect(blob).not.toMatch(/"f":\[|"y":[01]|"records"/);
    for (const p of parts) {
      const local = client.loadLocalDataset(p.keyId);
      for (const r of local.slice(0, 25)) expect(blob).not.toContain(JSON.stringify(r.f).slice(1, -1));
    }
  });

  it('round records are append-only for the application role', async () => {
    await expect(D.withSystemTx((tx) => tx.update(D.schema.flRounds).set({ status: 'aborted' }))).rejects.toThrow();
    await expect(D.withSystemTx((tx) => tx.delete(D.schema.flRounds))).rejects.toThrow();
  });
});

describe('federated model lifecycle', () => {
  it('a candidate cannot be deployed before approval; rollback restores the parent', async () => {
    const admin = await loginAs(U.admin);
    const cand = (await models()).find((m) => m.status === 'candidate')!;
    expect(cand).toBeTruthy();
    const parent = cand.parentVersion!;
    expect((await byVersion(parent)).status).toBe('deployed');

    await expectHttp(fl.decideModel(admin, cand.id, { decision: 'deploy', note: 'skip review' }), 409, 'invalid_transition');
    await expect(fl.decideModel(admin, cand.id, { decision: 'approve', note: '' })).rejects.toThrow(/decision note/);
    await fl.decideModel(admin, cand.id, { decision: 'approve', note: 'Holdout metrics beat baselines.' });
    await fl.decideModel(admin, cand.id, { decision: 'deploy', note: 'Deploying after review.' });
    expect((await byVersion(cand.version)).status).toBe('deployed');
    expect((await byVersion(parent)).status).toBe('approved');

    await fl.decideModel(admin, cand.id, { decision: 'rollback', note: 'Rollback drill.' });
    expect((await byVersion(cand.version)).status).toBe('rolled_back');
    expect((await byVersion(parent)).status).toBe('deployed');
    await expectHttp(fl.decideModel(admin, cand.id, { decision: 'deploy', note: 'again' }), 409);

    const audits = await D.withSystemTx((tx) => tx.select().from(D.schema.auditEvents).where(eq(D.schema.auditEvents.resourceId, cand.id)));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['federated.model.approve', 'federated.model.deploy', 'federated.model.rollback']));
  });

  it('a newly enrolled participant joins the next round; a withdrawn one is excluded and flagged in lineage', async () => {
    const admin = await loginAs(U.admin);
    await fl.enrol(await loginAs(U.meridianAdmin, 'meridian'), { consent: true, consentVersion: 'fl-consent/2026-10' });
    const r1 = await fl.runRound(admin, { scenarios: { dropout: true, poison: true, forged: true } });
    expect(r1.status).toBe('completed'); // 5 enrolled − dropout − poisoned = 3 accepted

    const hana = await loginAs(U.harborAdmin, 'harbor');
    const harbor = await fl.getMyEnrolment(hana);
    await fl.withdraw(hana);
    expect((await fl.getMyEnrolment(hana)).status).toBe('withdrawn');

    const r2 = await fl.runRound(admin, { scenarios: { dropout: false, poison: false, forged: false } });
    const [row] = await D.withSystemTx((tx) => tx.select().from(D.schema.flRounds).where(eq(D.schema.flRounds.roundNo, r2.roundNo)));
    const labels = (row.participants as { label: string }[]).map((p) => p.label);
    expect(labels).not.toContain((harbor as { label: string }).label);
    expect(labels).toHaveLength(4);

    // The round-1 candidate includes harbor's accepted update: approved models with withdrawn lineage cannot be newly deployed.
    const view = await fl.getProgramme(admin);
    const flagged = view.models.find((m) => m.version === r1.modelVersion)!;
    expect(flagged.lineage.withdrawn).toContain((harbor as { label: string }).label);
    await fl.decideModel(admin, flagged.id, { decision: 'approve', note: 'Metrics fine, but lineage flagged.' });
    await expectHttp(fl.decideModel(admin, flagged.id, { decision: 'deploy', note: 'try deploy' }), 409, 'lineage_includes_withdrawn');
  });
});
