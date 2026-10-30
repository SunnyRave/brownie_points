import { schema, withSystemTx, type Tx } from '@/lib/db';

export type AuditInput = {
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  tenantId?: string | null;
  decision?: 'allow' | 'deny';
  meta?: Record<string, unknown>;
};

/** Write inside the same transaction as the change it records. */
export async function audit(tx: Tx, e: AuditInput) {
  await tx.insert(schema.auditEvents).values({
    actorId: e.actorId,
    action: e.action,
    resourceType: e.resourceType,
    resourceId: e.resourceId ?? null,
    tenantId: e.tenantId ?? null,
    decision: e.decision ?? 'allow',
    meta: e.meta ?? {},
  });
}

/** Denials are recorded in their own transaction so a rolled-back request still leaves a trace. */
export async function auditDenial(e: Omit<AuditInput, 'decision'>) {
  await withSystemTx((tx) => audit(tx, { ...e, decision: 'deny' }));
}
