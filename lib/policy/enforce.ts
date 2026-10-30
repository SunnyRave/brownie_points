import { authorize } from './authorize';
import type { Action, Principal, Resource } from './types';
import { auditDenial } from '@/lib/audit';
import { HttpError } from '@/lib/http';

/**
 * authorize() + audit on denial + throw. Use in every route handler, server action, page loader and media route.
 */
export async function enforce(
  principal: Principal | null,
  action: Action,
  resource: Resource,
  ctx: { entitledOfferingIds?: string[] } = {},
) {
  const decision = authorize(principal, action, resource, { entitledOfferingIds: ctx.entitledOfferingIds });
  if (decision.allow) return;
  if (resource.audience?.kind !== 'public') {
    await auditDenial({
      actorId: principal?.userId ?? null,
      action: `${action}:${resource.type}`,
      resourceType: resource.type,
      resourceId: resource.id ?? null,
      tenantId: principal?.activeTenantId ?? null,
      meta: { reason: decision.reason },
    });
  }
  throw new HttpError(decision.status, decision.reason);
}

export function can(principal: Principal | null, action: Action, resource: Resource, ctx: { entitledOfferingIds?: string[] } = {}) {
  return authorize(principal, action, resource, { entitledOfferingIds: ctx.entitledOfferingIds }).allow;
}
