import { schema, type Tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { applyDecision, executeRound, keyIdFor } from '@/lib/federated/service';
import { DEFAULT_CONFIG } from '@/lib/federated/types';
import { FL_CONSENT_VERSION } from '@/lib/federated/policy';
import type { Refs } from './refs';

const DAY = 86_400_000;

/**
 * Synthetic seed data for the federated programme. Must only insert (runs once per database).
 * Four orgs opt in; meridian and bluewater stay out so enrolment can be demonstrated live.
 * Rounds: 1 = dropout + forged sender (completes), reviewer approves + deploys v1;
 *         2 = poisoned update + forged sender (completes, v2 left as a candidate awaiting review);
 *         3 = dropout + poisoning together (aborts on minimum cohort — no model registered).
 */
export async function seedFederated(tx: Tx, refs: Refs) {
  const enrolments: [string, string][] = [
    ['northwind', refs.users.northwindAdmin.id],
    ['harbor', refs.users.harborAdmin.id],
    ['cedar', refs.background.cedar.id],
    ['atlas', refs.background.atlas.id],
  ];
  for (const [i, [slug, by]] of enrolments.entries()) {
    const org = refs.orgs[slug];
    const [p] = await tx
      .insert(schema.flParticipants)
      .values({ orgId: org.id, status: 'enrolled', consentedBy: by, consentedAt: new Date(Date.now() - (30 - i * 3) * DAY), keyId: keyIdFor(slug) })
      .returning();
    await audit(tx, { actorId: by, action: 'federated.enrol', resourceType: 'fl_participant', resourceId: p.id, tenantId: org.id, meta: { consentVersion: FL_CONSENT_VERSION, seeded: true } });
  }

  const admin = refs.users.admin.id;
  const r1 = await executeRound(tx, admin, { ...DEFAULT_CONFIG, scenarios: { dropout: true, poison: false, forged: true } });
  if (r1.model) {
    await applyDecision(tx, admin, r1.model.id, { decision: 'approve', note: 'Seeded demo review: beats majority baseline and every local-only model on the holdout.' });
    await applyDecision(tx, admin, r1.model.id, { decision: 'deploy', note: 'Seeded demo deployment decision (synthetic programme).' });
  }
  await executeRound(tx, admin, { ...DEFAULT_CONFIG, scenarios: { dropout: false, poison: true, forged: true } });
  await executeRound(tx, admin, { ...DEFAULT_CONFIG, scenarios: { dropout: true, poison: true, forged: false } });
}
