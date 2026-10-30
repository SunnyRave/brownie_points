import { describe, expect, it } from 'vitest';
import { authorize, hasGrant } from '@/lib/policy/authorize';
import type { Audience, Principal, PrincipalGrant, PrincipalMembership } from '@/lib/policy/types';

const A = 'tenant-a';
const B = 'tenant-b';
const AZ = 'azentio';

function principal(over: Partial<Principal> & { memberships?: PrincipalMembership[]; grants?: PrincipalGrant[] } = {}): Principal {
  return { userId: 'u1', email: 'u1@x.example', name: 'U1', sessionId: 's1', activeTenantId: null, memberships: [], grants: [], authMethod: 'magiclink', amr: [], authTime: new Date(), ...over };
}
const member = (orgId: string, role: PrincipalMembership['role'] = 'client_member', status: PrincipalMembership['status'] = 'active'): PrincipalMembership => ({
  orgId, orgSlug: orgId, orgName: orgId, orgType: orgId === AZ ? 'azentio' : 'client', role, status,
});
const grant = (g: PrincipalGrant['grant'], extra: Partial<PrincipalGrant> = {}): PrincipalGrant => ({ grant: g, scopeOrgId: null, scopeIdeaId: null, expiresAt: null, ...extra });

const employee = principal({ memberships: [member(AZ, 'employee')] });
const clientA = principal({ userId: 'ca', activeTenantId: A, memberships: [member(A)] });
const clientAdminA = principal({ userId: 'caa', activeTenantId: A, memberships: [member(A, 'client_admin')] });
const admin = principal({ userId: 'adm', memberships: [member(AZ, 'employee')], grants: [grant('portal_admin')] });
const moderator = principal({ userId: 'mod', memberships: [member(AZ, 'employee')], grants: [grant('moderator')] });
const publisher = principal({ userId: 'pub', memberships: [member(AZ, 'employee')], grants: [grant('content_publisher')] });
const everyone = [null, employee, clientA, clientAdminA, admin, moderator, publisher];

describe('authorize()', () => {
  it('AT-03: a resource with no audience metadata is denied for every role and action', () => {
    for (const p of everyone) for (const action of ['read', 'update', 'moderate', 'manage_grants'] as const) {
      for (const audience of [null, undefined, {} as Audience]) {
        expect(authorize(p, action, { type: 'x', audience }).allow).toBe(false);
      }
    }
  });

  it('public is explicit and read-only for anonymous callers', () => {
    expect(authorize(null, 'read', { type: 'page', audience: { kind: 'public' } }).allow).toBe(true);
    expect(authorize(null, 'update', { type: 'page', audience: { kind: 'public' } })).toMatchObject({ allow: false, status: 401 });
    expect(authorize(clientA, 'update', { type: 'page', audience: { kind: 'public' } }).allow).toBe(false);
    expect(authorize(null, 'create', { type: 'lead', audience: { kind: 'public' } }).allow).toBe(true);
  });

  it('AT-01: anonymous access to employee resources is 401', () => {
    expect(authorize(null, 'read', { type: 'broadcast', audience: { kind: 'employee' } })).toMatchObject({ allow: false, status: 401 });
  });

  it('employee audience: employees only; clients never', () => {
    expect(authorize(employee, 'read', { type: 'x', audience: { kind: 'employee' } }).allow).toBe(true);
    expect(authorize(clientA, 'read', { type: 'x', audience: { kind: 'employee' } }).allow).toBe(false);
    const pendingEmployee = principal({ memberships: [member(AZ, 'employee', 'pending')] });
    expect(authorize(pendingEmployee, 'read', { type: 'x', audience: { kind: 'employee' } }).allow).toBe(false);
  });

  it('AT-02: tenant resources require the server-side active tenant + active membership; a forged ctx tenant is refused', () => {
    expect(authorize(clientA, 'read', { type: 'obs', audience: { kind: 'tenant', tenantId: A } }).allow).toBe(true);
    expect(authorize(clientA, 'read', { type: 'obs', audience: { kind: 'tenant', tenantId: B } }).allow).toBe(false);
    expect(authorize(clientA, 'read', { type: 'obs', audience: { kind: 'tenant', tenantId: B } }, { activeTenantId: B }).allow).toBe(false);
    const forgedSession = principal({ activeTenantId: B, memberships: [member(A)] });
    expect(authorize(forgedSession, 'read', { type: 'obs', audience: { kind: 'tenant', tenantId: B } }).allow).toBe(false);
    const revoked = principal({ activeTenantId: A, memberships: [member(A, 'client_member', 'revoked')] });
    expect(authorize(revoked, 'read', { type: 'obs', audience: { kind: 'tenant', tenantId: A } }).allow).toBe(false);
  });

  it('employee status does not imply admin or any client access (IAM-02)', () => {
    expect(authorize(employee, 'manage_grants', { type: 'admin', audience: { kind: 'grant', grant: 'portal_admin' } }).allow).toBe(false);
    expect(authorize(employee, 'read', { type: 'obs', audience: { kind: 'tenant', tenantId: A } }).allow).toBe(false);
    expect(authorize(admin, 'read', { type: 'obs', audience: { kind: 'tenant', tenantId: A } }).allow).toBe(false);
  });

  it('AT-04: banner edits need content_publisher', () => {
    const banner = { type: 'banner', audience: { kind: 'public' as const } };
    expect(authorize(employee, 'publish_content', banner).allow).toBe(false);
    expect(authorize(admin, 'publish_content', banner).allow).toBe(false);
    expect(authorize(publisher, 'publish_content', banner).allow).toBe(true);
  });

  it('separate grants: moderator cannot publish content, publisher cannot moderate', () => {
    const queue = { type: 'q', audience: { kind: 'grant' as const, grant: 'moderator' as const } };
    expect(authorize(moderator, 'moderate', queue).allow).toBe(true);
    expect(authorize(publisher, 'moderate', queue).allow).toBe(false);
    expect(authorize(moderator, 'publish_content', { type: 'banner', audience: { kind: 'public' } }).allow).toBe(false);
  });

  it('client admin actions only in own active tenant', () => {
    const team = { type: 'team', audience: { kind: 'tenant' as const, tenantId: A } };
    expect(authorize(clientAdminA, 'invite_member', team).allow).toBe(true);
    expect(authorize(clientA, 'invite_member', team).allow).toBe(false);
    expect(authorize(clientAdminA, 'invite_member', { type: 'team', audience: { kind: 'tenant', tenantId: B } }).allow).toBe(false);
  });

  it('IAM-07: tenant sandboxes require a product entitlement', () => {
    const sandbox = { type: 'sandbox', audience: { kind: 'tenant' as const, tenantId: A }, offeringId: 'fai' };
    expect(authorize(clientA, 'read', sandbox, { entitledOfferingIds: [] })).toMatchObject({ allow: false, reason: 'not_entitled' });
    expect(authorize(clientA, 'read', sandbox, { entitledOfferingIds: ['fai'] }).allow).toBe(true);
  });

  it('expired grants are ignored', () => {
    const p = principal({ grants: [grant('moderator', { expiresAt: new Date(Date.now() - 1000) })] });
    expect(authorize(p, 'moderate', { type: 'q', audience: { kind: 'grant', grant: 'moderator' } }).allow).toBe(false);
  });

  it('IAM-08: support access needs portal_admin + an org-scoped live support grant', () => {
    const res = { type: 'support', audience: { kind: 'tenant' as const, tenantId: A } };
    expect(authorize(admin, 'support_access', res).allow).toBe(false);
    const withSupport = principal({ ...admin, grants: [grant('portal_admin'), grant('support_access', { scopeOrgId: A, expiresAt: new Date(Date.now() + 3600_000) })] });
    expect(authorize(withSupport, 'support_access', res).allow).toBe(true);
    expect(authorize(withSupport, 'support_access', { type: 'support', audience: { kind: 'tenant', tenantId: B } }).allow).toBe(false);
  });

  it('product owner scoped to one idea sees only that idea', () => {
    const scoped = principal({ memberships: [member(AZ, 'employee')], grants: [grant('product_owner', { scopeIdeaId: 'i1' })] });
    expect(authorize(scoped, 'read', { type: 'idea', audience: { kind: 'assigned', ideaId: 'i1' } }).allow).toBe(true);
    expect(authorize(scoped, 'read', { type: 'idea', audience: { kind: 'assigned', ideaId: 'i2' } }).allow).toBe(false);
    expect(hasGrant(scoped, 'product_owner')).toBe(false); // cannot create new ideas
  });

  it('shared community: employees and active client members only', () => {
    const shared = { type: 's', audience: { kind: 'shared_community' as const } };
    expect(authorize(null, 'read', shared).allow).toBe(false);
    expect(authorize(clientA, 'read', shared).allow).toBe(true);
    expect(authorize(employee, 'read', shared).allow).toBe(true);
    expect(authorize(principal({ memberships: [member(A)] }), 'read', shared).allow).toBe(false); // no active workspace
  });
});
