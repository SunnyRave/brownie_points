import type { Action, Audience, Decision, GrantName, Principal, PrincipalGrant, Resource } from './types';

/**
 * THE access decision. Pure and synchronous so it can be unit-tested exhaustively.
 * Deny unless every step passes:
 *  1. session (except public read)  2. explicit audience  3. audience admits principal
 *  4. tenant membership via server-side active tenant  5. action grant  6. product entitlement
 * Step 7 (audit) is done by the caller via `enforce()` in lib/policy/enforce.ts.
 */
export function authorize(
  principal: Principal | null,
  action: Action,
  resource: Resource,
  ctx: { activeTenantId?: string | null; entitledOfferingIds?: string[]; now?: Date } = {},
): Decision {
  const now = ctx.now ?? new Date();
  const audience = resource.audience;

  const hasAudience = !!audience && typeof audience === 'object' && 'kind' in audience;

  // 1. Anonymous callers may only read explicitly public resources.
  if (!principal) {
    if (hasAudience && audience.kind === 'public' && (action === 'read' || isPublicWrite(action, resource))) return { allow: true };
    return deny('unauthenticated', 401);
  }

  // 2. Missing audience metadata is never a fallback to public.
  if (!hasAudience) return deny('no_audience', 403);

  // The active tenant must come from the session; a ctx value that disagrees is ignored.
  const activeTenantId = principal.activeTenantId;
  if (ctx.activeTenantId !== undefined && ctx.activeTenantId !== activeTenantId) {
    return deny('tenant_membership_invalid', 403);
  }

  // 3 + 4. Audience admits principal. A support_access request is the one exception: the admin is not a
  // tenant member, so the org-scoped, time-boxed support grant (checked in step 5) replaces the membership check.
  if (action !== 'support_access') {
    const audienceOk = admits(principal, audience, activeTenantId, now);
    if (audienceOk !== true) return deny(audienceOk, 403);
  }

  // Public resources are read-only for everyone without a specific grant.
  if (audience.kind === 'public' && action !== 'read' && !requiredGrantFor(action) && !isPublicWrite(action, resource)) {
    return deny('missing_grant', 403);
  }

  // 5. Action-specific grant.
  const needed = requiredGrantFor(action);
  if (needed === 'client_admin') {
    if (!activeTenantId || !hasClientAdmin(principal, activeTenantId)) return deny('missing_grant', 403);
  } else if (needed === 'support_access') {
    const tenantId = audience.kind === 'tenant' || audience.kind === 'author' ? audience.tenantId : null;
    if (!tenantId || !hasGrant(principal, 'portal_admin', now) || !hasGrant(principal, 'support_access', now, { orgId: tenantId })) {
      return deny('missing_grant', 403);
    }
  } else if (needed === 'product_owner') {
    const ideaScope = audience.kind === 'assigned' ? audience.ideaId : undefined;
    if (!hasGrant(principal, 'product_owner', now, ideaScope ? { ideaId: ideaScope } : undefined)) return deny('missing_grant', 403);
  } else if (needed) {
    if (!hasGrant(principal, needed, now)) return deny('missing_grant', 403);
  }

  // 6. Entitlement for tenant-scoped demos/sandboxes.
  if (resource.offeringId && audience.kind === 'tenant') {
    if (!ctx.entitledOfferingIds?.includes(resource.offeringId)) return deny('not_entitled', 403);
  }

  return { allow: true };
}

type RequiredGrant = GrantName | 'client_admin' | null;

export function requiredGrantFor(action: Action): RequiredGrant {
  switch (action) {
    case 'moderate':
    case 'publish':
      return 'moderator';
    case 'publish_content':
    case 'manage_broadcast':
      return 'content_publisher';
    case 'manage_grants':
      return 'portal_admin';
    case 'manage_idea':
      return 'product_owner';
    case 'invite_member':
    case 'manage_client_roles':
      return 'client_admin';
    case 'support_access':
      return 'support_access';
    default:
      return null;
  }
}

function admits(p: Principal, a: Audience, activeTenantId: string | null, now: Date): true | 'audience_mismatch' | 'no_active_tenant' | 'tenant_membership_invalid' {
  switch (a.kind) {
    case 'public':
      return true;
    case 'employee':
      return isEmployee(p) ? true : 'audience_mismatch';
    case 'tenant':
      return tenantOk(p, a.tenantId, activeTenantId);
    case 'author': {
      if (p.userId !== a.userId) return 'audience_mismatch';
      return tenantOk(p, a.tenantId, activeTenantId);
    }
    case 'shared_community':
      if (isEmployee(p)) return true;
      if (!activeTenantId) return 'no_active_tenant';
      return hasActiveMembership(p, activeTenantId, 'client') ? true : 'tenant_membership_invalid';
    case 'assigned':
      return hasGrant(p, 'product_owner', now, { ideaId: a.ideaId }) ? true : 'audience_mismatch';
    case 'grant':
      return hasGrant(p, a.grant, now) ? true : 'audience_mismatch';
    default:
      return 'audience_mismatch';
  }
}

function tenantOk(p: Principal, tenantId: string, activeTenantId: string | null) {
  if (!activeTenantId) return 'no_active_tenant' as const;
  if (activeTenantId !== tenantId) return 'tenant_membership_invalid' as const;
  return hasActiveMembership(p, tenantId) ? (true as const) : ('tenant_membership_invalid' as const);
}

export function isEmployee(p: Principal | null): boolean {
  return !!p?.memberships.some((m) => m.orgType === 'azentio' && m.role === 'employee' && m.status === 'active');
}

export function hasActiveMembership(p: Principal, orgId: string, orgType?: 'client' | 'azentio') {
  return p.memberships.some((m) => m.orgId === orgId && m.status === 'active' && (!orgType || m.orgType === orgType));
}

export function hasClientAdmin(p: Principal, orgId: string) {
  return p.memberships.some((m) => m.orgId === orgId && m.status === 'active' && m.role === 'client_admin' && m.orgType === 'client');
}

function grantLive(g: PrincipalGrant, now: Date) {
  return !g.expiresAt || g.expiresAt.getTime() > now.getTime();
}

/**
 * support_access only ever matches its own org scope; product_owner scoped to an idea matches only that idea,
 * and creating new ideas needs an unscoped product_owner grant. Other grants are platform-wide.
 */
export function hasGrant(p: Principal | null, grant: GrantName, now = new Date(), scope?: { orgId?: string; ideaId?: string }) {
  if (!p) return false;
  return p.grants.some((g) => {
    if (g.grant !== grant || !grantLive(g, now)) return false;
    if (grant === 'support_access') return !!scope?.orgId && g.scopeOrgId === scope.orgId;
    if (grant === 'product_owner') return scope?.ideaId ? g.scopeIdeaId === null || g.scopeIdeaId === scope.ideaId : g.scopeIdeaId === null;
    return true;
  });
}

/** Anonymous public forms (demo request, event registration) are the only public writes. */
const PUBLIC_WRITE_TYPES = new Set(['lead', 'event_registration']);
function isPublicWrite(action: Action, resource: Resource) {
  return action === 'create' && PUBLIC_WRITE_TYPES.has(resource.type);
}

function deny(reason: Extract<Decision, { allow: false }>['reason'], status: 401 | 403): Decision {
  return { allow: false, reason, status };
}
