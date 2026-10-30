import { and, eq, inArray } from 'drizzle-orm';
import { schema, withSystemTx, withTenantTx } from '@/lib/db';
import { enforce } from '@/lib/policy/enforce';
import { listBroadcasts, listContent } from './content';
import { listPublicIdeas } from './ideas';
import type { Principal } from '@/lib/policy/types';

export async function workspaceContext(principal: Principal | null) {
  const tenantId = principal?.activeTenantId ?? null;
  await enforce(principal, 'read', { type: 'workspace', audience: tenantId ? { kind: 'tenant', tenantId } : null });
  const m = principal!.memberships.find((x) => x.orgId === tenantId)!;
  return { tenantId: tenantId!, orgName: m.orgName, orgSlug: m.orgSlug, role: m.role };
}

/** CLI-01: everything on the dashboard is scoped to the active tenant or the shared community. */
export async function workspaceDashboard(principal: Principal | null) {
  const ctx = await workspaceContext(principal);
  const entitled = await withSystemTx((tx) =>
    tx
      .select({ id: schema.offerings.id, slug: schema.offerings.slug, name: schema.offerings.name, summary: schema.offerings.summary, sandboxEnabled: schema.entitlements.sandboxEnabled })
      .from(schema.entitlements)
      .innerJoin(schema.offerings, eq(schema.offerings.id, schema.entitlements.offeringId))
      .where(eq(schema.entitlements.orgId, ctx.tenantId)),
  );
  const mine = await withTenantTx(principal!.userId, ctx.tenantId, (tx) =>
    tx.select({ state: schema.observations.state }).from(schema.observations).where(eq(schema.observations.authorId, principal!.userId)),
  );
  const counts = mine.reduce<Record<string, number>>((acc, o) => ((acc[o.state] = (acc[o.state] ?? 0) + 1), acc), {});
  const sessions = (await listBroadcasts(principal)).filter((b) => b.audience?.kind !== 'employee');
  const ideas = (await listPublicIdeas(principal)).slice(0, 4);
  return { ...ctx, entitled, counts, sessions, ideas };
}

export async function workspaceResources(principal: Principal | null) {
  await workspaceContext(principal);
  const [briefings, notes, sessions] = await Promise.all([listContent(principal, 'briefing'), listContent(principal, 'release_note'), listBroadcasts(principal)]);
  return { briefings, notes, sessions: sessions.filter((b) => b.audience?.kind === 'tenant' || b.audience?.kind === 'shared_community') };
}

export async function entitledSandboxOfferings(principal: Principal | null) {
  const ctx = await workspaceContext(principal);
  const rows = await withSystemTx((tx) =>
    tx
      .select({ id: schema.offerings.id, slug: schema.offerings.slug, name: schema.offerings.name, sandboxEnabled: schema.entitlements.sandboxEnabled })
      .from(schema.offerings)
      .leftJoin(schema.entitlements, and(eq(schema.entitlements.offeringId, schema.offerings.id), eq(schema.entitlements.orgId, ctx.tenantId))),
  );
  return rows.map((r) => ({ ...r, sandboxEnabled: !!r.sandboxEnabled }));
}

export async function offeringNames(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await withSystemTx((tx) => tx.select({ id: schema.offerings.id, name: schema.offerings.name }).from(schema.offerings).where(inArray(schema.offerings.id, ids)));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function allOfferings() {
  return withSystemTx((tx) => tx.select({ id: schema.offerings.id, name: schema.offerings.name, slug: schema.offerings.slug }).from(schema.offerings));
}
