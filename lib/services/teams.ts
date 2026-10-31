import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, withSystemTx, type Tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { enforce } from '@/lib/policy/enforce';
import { badRequest, forbidden, HttpError, notFound } from '@/lib/http';
import type { Principal } from '@/lib/policy/types';

/**
 * Employee-only hackathon team spaces (§05). The tables are system-mode only under RLS, so every entry point
 * enforces the employee audience first. Team spaces are never indexed for search and never reach AIRA.
 */

export const SPACE_STATUSES = ['forming', 'building', 'submitted', 'archived'] as const;
export type SpaceStatus = (typeof SPACE_STATUSES)[number];
export const SPACE_STATUS_LABELS: Record<SpaceStatus, string> = { forming: 'Forming', building: 'Building', submitted: 'Submitted', archived: 'Archived' };
/** Forward-only lifecycle; archiving is allowed from any state. */
const NEXT: Record<SpaceStatus, SpaceStatus[]> = { forming: ['building', 'archived'], building: ['submitted', 'archived'], submitted: ['archived'], archived: [] };
export const allowedNextStatuses = (s: SpaceStatus) => NEXT[s];

export const spaceCreateSchema = z.object({
  name: z.string().trim().min(3, 'Name is too short.').max(80),
  challenge: z.string().trim().min(10, 'Describe the challenge in a sentence or two.').max(1000),
});
export const spaceStatusSchema = z.object({ status: z.enum(SPACE_STATUSES) });
export const spacePostSchema = z
  .object({ kind: z.enum(['update', 'note', 'link']).default('update'), body: z.string().trim().min(2).max(2000) })
  .refine((v) => v.kind !== 'link' || /^https?:\/\/\S+$/i.test(v.body.split(/\s+/)[0]), { message: 'A link post must start with an http(s) URL.', path: ['body'] });

const resource = (id?: string) => ({ type: 'team_space', id: id ?? null, audience: { kind: 'employee' as const } });

type Space = typeof schema.teamSpaces.$inferSelect;

async function loadSpace(tx: Tx, id: string) {
  const [s] = await tx.select().from(schema.teamSpaces).where(eq(schema.teamSpaces.id, id)).limit(1);
  if (!s) throw notFound();
  return s;
}
async function roleOf(tx: Tx, spaceId: string, userId: string) {
  const [m] = await tx.select({ role: schema.teamSpaceMembers.role }).from(schema.teamSpaceMembers).where(and(eq(schema.teamSpaceMembers.spaceId, spaceId), eq(schema.teamSpaceMembers.userId, userId))).limit(1);
  return m?.role ?? null;
}
const spaceDTO = (s: Space) => ({ id: s.id, name: s.name, challenge: s.challenge, status: s.status as SpaceStatus, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() });

export async function listSpaces(principal: Principal | null) {
  await enforce(principal, 'read', resource());
  const uid = principal!.userId;
  return withSystemTx(async (tx) => {
    const spaces = await tx.select().from(schema.teamSpaces).orderBy(desc(schema.teamSpaces.updatedAt));
    if (!spaces.length) return [];
    const ids = spaces.map((s) => s.id);
    const members = await tx
      .select({ spaceId: schema.teamSpaceMembers.spaceId, userId: schema.teamSpaceMembers.userId, role: schema.teamSpaceMembers.role, name: schema.users.name })
      .from(schema.teamSpaceMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.teamSpaceMembers.userId))
      .where(inArray(schema.teamSpaceMembers.spaceId, ids));
    const posts = await tx.select({ spaceId: schema.teamSpacePosts.spaceId, n: sql<number>`count(*)::int` }).from(schema.teamSpacePosts).where(inArray(schema.teamSpacePosts.spaceId, ids)).groupBy(schema.teamSpacePosts.spaceId);
    const postCount = new Map(posts.map((p) => [p.spaceId, p.n]));
    return spaces.map((s) => {
      const ms = members.filter((m) => m.spaceId === s.id);
      return {
        ...spaceDTO(s),
        memberCount: ms.length,
        memberNames: ms.map((m) => m.name),
        postCount: postCount.get(s.id) ?? 0,
        myRole: ms.find((m) => m.userId === uid)?.role ?? null,
      };
    });
  });
}

export async function getSpace(principal: Principal | null, id: string) {
  await enforce(principal, 'read', resource(id));
  const uid = principal!.userId;
  return withSystemTx(async (tx) => {
    const s = await loadSpace(tx, id);
    const members = await tx
      .select({ userId: schema.teamSpaceMembers.userId, role: schema.teamSpaceMembers.role, name: schema.users.name, since: schema.teamSpaceMembers.createdAt })
      .from(schema.teamSpaceMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.teamSpaceMembers.userId))
      .where(eq(schema.teamSpaceMembers.spaceId, id))
      .orderBy(asc(schema.teamSpaceMembers.createdAt));
    const posts = await tx
      .select({ id: schema.teamSpacePosts.id, kind: schema.teamSpacePosts.kind, body: schema.teamSpacePosts.body, authorId: schema.teamSpacePosts.authorId, authorName: schema.users.name, createdAt: schema.teamSpacePosts.createdAt })
      .from(schema.teamSpacePosts)
      .leftJoin(schema.users, eq(schema.users.id, schema.teamSpacePosts.authorId))
      .where(eq(schema.teamSpacePosts.spaceId, id))
      .orderBy(desc(schema.teamSpacePosts.createdAt));
    const myRole = members.find((m) => m.userId === uid)?.role ?? null;
    return {
      space: spaceDTO(s),
      members: members.map((m) => ({ userId: m.userId, role: m.role, name: m.name, since: m.since.toISOString(), isMe: m.userId === uid })),
      posts: posts.map((p) => ({ id: p.id, kind: p.kind, body: p.body, authorName: p.authorName ?? 'Former member', mine: p.authorId === uid, createdAt: p.createdAt.toISOString() })),
      myRole,
      nextStatuses: myRole === 'owner' ? allowedNextStatuses(s.status as SpaceStatus) : [],
    };
  });
}

export async function createSpace(principal: Principal | null, raw: unknown) {
  await enforce(principal, 'create', resource());
  const input = spaceCreateSchema.parse(raw);
  const uid = principal!.userId;
  return withSystemTx(async (tx) => {
    const [s] = await tx.insert(schema.teamSpaces).values({ name: input.name, challenge: input.challenge, status: 'forming', createdBy: uid }).returning();
    await tx.insert(schema.teamSpaceMembers).values({ spaceId: s.id, userId: uid, role: 'owner' });
    await audit(tx, { actorId: uid, action: 'team_space.create', resourceType: 'team_space', resourceId: s.id });
    return spaceDTO(s);
  });
}

export async function joinSpace(principal: Principal | null, id: string) {
  await enforce(principal, 'update', resource(id));
  const uid = principal!.userId;
  return withSystemTx(async (tx) => {
    const s = await loadSpace(tx, id);
    if (s.status === 'archived') throw new HttpError(409, 'space_archived', 'This team space is archived.');
    const inserted = await tx.insert(schema.teamSpaceMembers).values({ spaceId: id, userId: uid, role: 'member' }).onConflictDoNothing().returning();
    if (inserted.length) await audit(tx, { actorId: uid, action: 'team_space.join', resourceType: 'team_space', resourceId: id });
    return { ok: true };
  });
}

export async function leaveSpace(principal: Principal | null, id: string) {
  await enforce(principal, 'update', resource(id));
  const uid = principal!.userId;
  return withSystemTx(async (tx) => {
    await loadSpace(tx, id);
    const role = await roleOf(tx, id, uid);
    if (!role) return { ok: true };
    if (role === 'owner') {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.teamSpaceMembers).where(and(eq(schema.teamSpaceMembers.spaceId, id), eq(schema.teamSpaceMembers.role, 'owner')));
      if (n <= 1) throw new HttpError(409, 'last_owner', 'The last owner can’t leave. Archive the space instead.');
    }
    await tx.delete(schema.teamSpaceMembers).where(and(eq(schema.teamSpaceMembers.spaceId, id), eq(schema.teamSpaceMembers.userId, uid)));
    await audit(tx, { actorId: uid, action: 'team_space.leave', resourceType: 'team_space', resourceId: id });
    return { ok: true };
  });
}

export async function postToSpace(principal: Principal | null, id: string, raw: unknown) {
  await enforce(principal, 'create', resource(id));
  const input = spacePostSchema.parse(raw);
  const uid = principal!.userId;
  return withSystemTx(async (tx) => {
    const s = await loadSpace(tx, id);
    if (!(await roleOf(tx, id, uid))) throw forbidden('not_member', 'Join the team space to post.');
    if (s.status === 'archived') throw new HttpError(409, 'space_archived', 'This team space is archived.');
    const [p] = await tx.insert(schema.teamSpacePosts).values({ spaceId: id, authorId: uid, kind: input.kind, body: input.body }).returning();
    await tx.update(schema.teamSpaces).set({ updatedAt: new Date() }).where(eq(schema.teamSpaces.id, id));
    return { id: p.id };
  });
}

export async function setSpaceStatus(principal: Principal | null, id: string, raw: unknown) {
  await enforce(principal, 'update', resource(id));
  const { status } = spaceStatusSchema.parse(raw);
  const uid = principal!.userId;
  return withSystemTx(async (tx) => {
    const s = await loadSpace(tx, id);
    if ((await roleOf(tx, id, uid)) !== 'owner') throw forbidden('not_owner', 'Only team owners can change the status.');
    if (!NEXT[s.status as SpaceStatus].includes(status)) throw new HttpError(409, 'invalid_transition', `Can’t move from ${s.status} to ${status}.`);
    await tx.update(schema.teamSpaces).set({ status, updatedAt: new Date() }).where(and(eq(schema.teamSpaces.id, id), eq(schema.teamSpaces.status, s.status)));
    await audit(tx, { actorId: uid, action: 'team_space.status_change', resourceType: 'team_space', resourceId: id, meta: { from: s.status, to: status } });
    return { ok: true, status };
  });
}

export async function removeMember(principal: Principal | null, id: string, userId: string) {
  await enforce(principal, 'update', resource(id));
  const uid = principal!.userId;
  return withSystemTx(async (tx) => {
    await loadSpace(tx, id);
    if ((await roleOf(tx, id, uid)) !== 'owner') throw forbidden('not_owner', 'Only team owners can remove members.');
    if (userId === uid) throw badRequest('use_leave', 'Use “Leave” to remove yourself.');
    const removed = await tx.delete(schema.teamSpaceMembers).where(and(eq(schema.teamSpaceMembers.spaceId, id), eq(schema.teamSpaceMembers.userId, userId))).returning();
    if (!removed.length) throw notFound();
    await audit(tx, { actorId: uid, action: 'team_space.remove_member', resourceType: 'team_space', resourceId: id, meta: { userId } });
    return { ok: true };
  });
}
