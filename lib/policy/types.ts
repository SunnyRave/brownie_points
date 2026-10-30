export type Audience =
  | { kind: 'public' }
  | { kind: 'employee' }
  | { kind: 'tenant'; tenantId: string }
  | { kind: 'author'; userId: string; tenantId: string }
  | { kind: 'shared_community' }
  | { kind: 'assigned'; ideaId: string }
  // Platform surfaces (moderation queue, admin console, publishing tools) admit only holders of a grant.
  | { kind: 'grant'; grant: GrantName };

export type Action =
  | 'read' | 'create' | 'update' | 'delete'
  | 'submit' | 'moderate' | 'publish' | 'withdraw' | 'report'
  | 'invite_member' | 'manage_client_roles' | 'manage_grants'
  | 'publish_content' | 'manage_broadcast' | 'manage_idea' | 'support_access';

export type GrantName = 'moderator' | 'content_publisher' | 'product_owner' | 'portal_admin' | 'support_access';
export type MembershipRole = 'employee' | 'client_member' | 'client_admin';

export type PrincipalMembership = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  orgType: 'azentio' | 'client';
  role: MembershipRole;
  status: 'active' | 'pending' | 'revoked';
};

export type PrincipalGrant = {
  grant: GrantName;
  scopeOrgId: string | null;
  scopeIdeaId: string | null;
  expiresAt: Date | null;
};

export type Principal = {
  userId: string;
  email: string;
  name: string;
  sessionId: string;
  /** From the server-side session row only. Never from a header, cookie value or URL. */
  activeTenantId: string | null;
  memberships: PrincipalMembership[];
  grants: PrincipalGrant[];
  authMethod: 'microsoft' | 'magiclink';
  amr: string[];
  authTime: Date;
};

export type Resource = {
  type: string;
  id?: string | null;
  audience: Audience | null | undefined;
  /** Product a tenant-scoped demo/sandbox belongs to; requires an entitlement. */
  offeringId?: string | null;
};

export type Decision = { allow: true } | { allow: false; reason: DenyReason; status: 401 | 403 };

export type DenyReason =
  | 'no_audience'
  | 'unauthenticated'
  | 'audience_mismatch'
  | 'no_active_tenant'
  | 'tenant_membership_invalid'
  | 'missing_grant'
  | 'not_entitled';
