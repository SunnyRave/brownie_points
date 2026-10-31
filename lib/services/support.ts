import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, withSystemTx, withTenantTx, type Tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/outbox';
import { enforce } from '@/lib/policy/enforce';
import { forbidden, HttpError, notFound } from '@/lib/http';
import { scanSensitive } from '@/lib/scan';
import type { Principal } from '@/lib/policy/types';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, STATUS_LABELS, type TicketStatus } from '@/components/support/labels';
export { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, STATUS_LABELS, CATEGORY_LABELS, type TicketStatus } from '@/components/support/labels';

/**
 * Client support tickets (§06). A ticket is content a client organisation explicitly addresses to Azentio
 * support, so it is visible to (1) members of that client's active tenant (RLS: support_tickets_tenant) and
 * (2) holders of the platform `support_agent` grant via the desk. It is never indexed for search, never shown
 * on any shared/community surface and never retrieved by AIRA. The desk sees ticket threads only — not the
 * organisation's observations or other private content (that needs the separate, time-boxed support_access grant).
 */


const bodyField = z.string().trim().min(2, 'Write a short message.').max(5000);
export const ticketCreateSchema = z.object({
  subject: z.string().trim().min(4, 'Subject is too short.').max(160),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES).default('normal'),
  body: bodyField,
});
export const ticketReplySchema = z.object({ body: bodyField });
export const deskReplySchema = z.object({ body: bodyField, status: z.enum(TICKET_STATUSES).optional() });
export const ticketStatusSchema = z.object({ status: z.enum(TICKET_STATUSES) });

type Ticket = typeof schema.supportTickets.$inferSelect;
type Message = typeof schema.supportTicketMessages.$inferSelect;

const deskResource = (id?: string) => ({ type: 'support_ticket', id: id ?? null, audience: { kind: 'grant' as const, grant: 'support_agent' as const } });

/** Client paths run in the session's active tenant and only for client organisations. */
async function clientTenant(principal: Principal | null, action: 'read' | 'create' | 'update', id?: string) {
  const tenantId = principal?.activeTenantId ?? null;
  await enforce(principal, action, { type: 'support_ticket', id: id ?? null, audience: tenantId ? { kind: 'tenant', tenantId } : null });
  const m = principal!.memberships.find((x) => x.orgId === tenantId && x.status === 'active');
  if (m?.orgType !== 'client') throw forbidden('client_workspace_only', 'Support tickets are raised from a client workspace.');
  return { principal: principal!, tenantId: tenantId! };
}

async function namesFor(ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, string>();
  const rows = await withSystemTx((tx) => tx.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, unique)));
  return new Map(rows.map((r) => [r.id, r.name]));
}

function ticketDTO(t: Ticket, extra: { createdByName?: string | null; orgName?: string | null; messageCount?: number; lastSide?: string | null } = {}) {
  return {
    id: t.id,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    createdBy: t.createdBy,
    createdByName: extra.createdByName ?? null,
    orgName: extra.orgName ?? null,
    messageCount: extra.messageCount ?? 0,
    lastSide: extra.lastSide ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
export type TicketDTO = ReturnType<typeof ticketDTO>;

function messageDTO(m: Message, names: Map<string, string>, viewer: 'client' | 'azentio') {
  return {
    id: m.id,
    authorSide: m.authorSide,
    // Clients see "Azentio support" plus the agent's name; the desk sees the client author's name.
    authorName: names.get(m.authorId) ?? (m.authorSide === 'azentio' ? 'Azentio support' : 'Client user'),
    body: m.body,
    // Flags (never blocks) possible account numbers etc. on client-written messages, for both sides to see.
    flags: m.authorSide === 'client' ? scanSensitive({ title: '', body: m.body }).map((f) => f.kind) : [],
    mine: viewer === m.authorSide,
    createdAt: m.createdAt.toISOString(),
  };
}
export type TicketMessageDTO = ReturnType<typeof messageDTO>;

async function supportAgents(tx: Tx) {
  const rows = await tx.select({ userId: schema.grants.userId, expiresAt: schema.grants.expiresAt }).from(schema.grants).where(eq(schema.grants.grant, 'support_agent'));
  const now = Date.now();
  return [...new Set(rows.filter((r) => !r.expiresAt || r.expiresAt.getTime() > now).map((r) => r.userId))];
}

async function notifyAgents(tx: Tx, t: Ticket, title: string, key: string) {
  for (const userId of await supportAgents(tx)) {
    await notify(tx, { userId, type: 'support_ticket', title, link: `/hub/support/${t.id}`, dedupeKey: `support:${t.id}:${key}:${userId}` });
  }
}

// ───────────────────────── Client side ─────────────────────────

export async function listTicketsForClient(principalIn: Principal | null) {
  const { principal, tenantId } = await clientTenant(principalIn, 'read');
  const { tickets, counts } = await withTenantTx(principal.userId, tenantId, async (tx) => {
    // RLS already limits this to the active tenant; the explicit filter is defence in depth.
    const tickets = await tx.select().from(schema.supportTickets).where(eq(schema.supportTickets.tenantId, tenantId)).orderBy(desc(schema.supportTickets.updatedAt));
    const counts = tickets.length
      ? await tx
          .select({ ticketId: schema.supportTicketMessages.ticketId, n: sql<number>`count(*)::int` })
          .from(schema.supportTicketMessages)
          .where(inArray(schema.supportTicketMessages.ticketId, tickets.map((t) => t.id)))
          .groupBy(schema.supportTicketMessages.ticketId)
      : [];
    return { tickets, counts };
  });
  const names = await namesFor(tickets.map((t) => t.createdBy));
  const n = new Map(counts.map((c) => [c.ticketId, c.n]));
  return tickets.map((t) => ticketDTO(t, { createdByName: names.get(t.createdBy), messageCount: n.get(t.id) ?? 0 }));
}

export async function createTicket(principalIn: Principal | null, raw: unknown) {
  const { principal, tenantId } = await clientTenant(principalIn, 'create');
  const input = ticketCreateSchema.parse(raw);
  const flags = scanSensitive({ title: input.subject, body: input.body });
  const ticket = await withTenantTx(principal.userId, tenantId, async (tx) => {
    const [t] = await tx.insert(schema.supportTickets).values({ tenantId, createdBy: principal.userId, subject: input.subject, category: input.category, priority: input.priority, status: 'open' }).returning();
    await tx.insert(schema.supportTicketMessages).values({ ticketId: t.id, tenantId, authorId: principal.userId, authorSide: 'client', body: input.body });
    await audit(tx, { actorId: principal.userId, action: 'support.ticket_create', resourceType: 'support_ticket', resourceId: t.id, tenantId, meta: { category: t.category, priority: t.priority, flags: flags.length } });
    await notifyAgents(tx, t, `New support ticket: ${t.subject}`, 'created');
    return t;
  });
  return { ticket: ticketDTO(ticket, { messageCount: 1 }), flags: flags.map((f) => f.kind) };
}

export async function getTicketForClient(principalIn: Principal | null, id: string) {
  const { principal, tenantId } = await clientTenant(principalIn, 'read', id);
  const { ticket, messages } = await withTenantTx(principal.userId, tenantId, async (tx) => {
    const [ticket] = await tx.select().from(schema.supportTickets).where(eq(schema.supportTickets.id, id)).limit(1);
    if (!ticket || ticket.tenantId !== tenantId) throw notFound(); // other tenants' tickets are invisible under RLS
    const messages = await tx.select().from(schema.supportTicketMessages).where(eq(schema.supportTicketMessages.ticketId, id)).orderBy(asc(schema.supportTicketMessages.createdAt));
    return { ticket, messages };
  });
  const names = await namesFor([ticket.createdBy, ...messages.map((m) => m.authorId)]);
  return { ticket: ticketDTO(ticket, { createdByName: names.get(ticket.createdBy), messageCount: messages.length }), messages: messages.map((m) => messageDTO(m, names, 'client')) };
}

async function loadClientTicket(tx: Tx, id: string, tenantId: string) {
  const [t] = await tx.select().from(schema.supportTickets).where(eq(schema.supportTickets.id, id)).limit(1);
  if (!t || t.tenantId !== tenantId) throw notFound();
  return t;
}

export async function replyAsClient(principalIn: Principal | null, id: string, raw: unknown) {
  const { principal, tenantId } = await clientTenant(principalIn, 'update', id);
  const { body } = ticketReplySchema.parse(raw);
  const flags = scanSensitive({ title: '', body });
  await withTenantTx(principal.userId, tenantId, async (tx) => {
    const t = await loadClientTicket(tx, id, tenantId);
    if (t.status === 'closed') throw new HttpError(409, 'ticket_closed', 'This ticket is closed. Open a new ticket if you still need help.');
    const [msg] = await tx.insert(schema.supportTicketMessages).values({ ticketId: id, tenantId, authorId: principal.userId, authorSide: 'client', body }).returning();
    // A client reply re-opens a ticket that was waiting on them or marked resolved.
    const to: TicketStatus = t.status === 'waiting_on_client' || t.status === 'resolved' ? 'open' : t.status;
    await tx.update(schema.supportTickets).set({ status: to, updatedAt: new Date() }).where(eq(schema.supportTickets.id, id));
    await audit(tx, { actorId: principal.userId, action: 'support.client_reply', resourceType: 'support_ticket', resourceId: id, tenantId, meta: { messageId: msg.id, flags: flags.length } });
    if (to !== t.status) await audit(tx, { actorId: principal.userId, action: 'support.status_change', resourceType: 'support_ticket', resourceId: id, tenantId, meta: { from: t.status, to, by: 'client' } });
    await notifyAgents(tx, t, `Client replied: ${t.subject}`, `msg:${msg.id}`);
  });
  return { ok: true, flags: flags.map((f) => f.kind) };
}

export async function closeTicketAsClient(principalIn: Principal | null, id: string) {
  const { principal, tenantId } = await clientTenant(principalIn, 'update', id);
  await withTenantTx(principal.userId, tenantId, async (tx) => {
    const t = await loadClientTicket(tx, id, tenantId);
    if (t.status === 'closed') return;
    await tx.update(schema.supportTickets).set({ status: 'closed', updatedAt: new Date() }).where(eq(schema.supportTickets.id, id));
    await audit(tx, { actorId: principal.userId, action: 'support.status_change', resourceType: 'support_ticket', resourceId: id, tenantId, meta: { from: t.status, to: 'closed', by: 'client' } });
    await notifyAgents(tx, t, `Client closed: ${t.subject}`, `closed:${Date.now()}`);
  });
  return { ok: true };
}

// ───────────────────────── Azentio support desk (support_agent grant) ─────────────────────────

export async function listDeskTickets(principal: Principal | null, filter: { status?: string } = {}) {
  await enforce(principal, 'handle_support', deskResource());
  const status = TICKET_STATUSES.includes(filter.status as TicketStatus) ? (filter.status as TicketStatus) : null;
  const rows = await withSystemTx(async (tx) => {
    const tickets = await tx
      .select({ t: schema.supportTickets, orgName: schema.organisations.name })
      .from(schema.supportTickets)
      .innerJoin(schema.organisations, eq(schema.organisations.id, schema.supportTickets.tenantId))
      .where(status ? eq(schema.supportTickets.status, status) : undefined)
      .orderBy(desc(schema.supportTickets.updatedAt));
    const ids = tickets.map((r) => r.t.id);
    const msgs = ids.length
      ? await tx.select({ ticketId: schema.supportTicketMessages.ticketId, side: schema.supportTicketMessages.authorSide, at: schema.supportTicketMessages.createdAt }).from(schema.supportTicketMessages).where(inArray(schema.supportTicketMessages.ticketId, ids)).orderBy(asc(schema.supportTicketMessages.createdAt))
      : [];
    return { tickets, msgs };
  });
  const names = await namesFor(rows.tickets.map((r) => r.t.createdBy));
  const stats = new Map<string, { n: number; last: string }>();
  for (const m of rows.msgs) stats.set(m.ticketId, { n: (stats.get(m.ticketId)?.n ?? 0) + 1, last: m.side });
  return rows.tickets.map((r) => ticketDTO(r.t, { orgName: r.orgName, createdByName: names.get(r.t.createdBy), messageCount: stats.get(r.t.id)?.n ?? 0, lastSide: stats.get(r.t.id)?.last ?? null }));
}

export async function getDeskTicket(principal: Principal | null, id: string) {
  await enforce(principal, 'handle_support', deskResource(id));
  const r = await withSystemTx(async (tx) => {
    const [row] = await tx
      .select({ t: schema.supportTickets, orgName: schema.organisations.name })
      .from(schema.supportTickets)
      .innerJoin(schema.organisations, eq(schema.organisations.id, schema.supportTickets.tenantId))
      .where(eq(schema.supportTickets.id, id))
      .limit(1);
    if (!row) throw notFound();
    const messages = await tx.select().from(schema.supportTicketMessages).where(eq(schema.supportTicketMessages.ticketId, id)).orderBy(asc(schema.supportTicketMessages.createdAt));
    return { ...row, messages };
  });
  const names = await namesFor([r.t.createdBy, ...r.messages.map((m) => m.authorId)]);
  return { ticket: ticketDTO(r.t, { orgName: r.orgName, createdByName: names.get(r.t.createdBy), messageCount: r.messages.length }), messages: r.messages.map((m) => messageDTO(m, names, 'azentio')) };
}

async function changeStatus(tx: Tx, agentId: string, t: Ticket, to: TicketStatus) {
  if (to === t.status) return false;
  await tx.update(schema.supportTickets).set({ status: to, updatedAt: new Date() }).where(eq(schema.supportTickets.id, t.id));
  await audit(tx, { actorId: agentId, action: 'support.status_change', resourceType: 'support_ticket', resourceId: t.id, tenantId: t.tenantId, meta: { from: t.status, to, by: 'azentio' } });
  await notify(tx, {
    userId: t.createdBy,
    type: 'support_status',
    title: `Support ticket “${t.subject}” — ${STATUS_LABELS[to]}`,
    link: `/w/_/support/${t.id}`,
    dedupeKey: `support:${t.id}:status:${to}:${Date.now()}`,
  });
  return true;
}

async function loadDeskTicket(tx: Tx, id: string) {
  const [t] = await tx.select().from(schema.supportTickets).where(eq(schema.supportTickets.id, id)).limit(1);
  if (!t) throw notFound();
  return t;
}

export async function replyAsAgent(principal: Principal | null, id: string, raw: unknown) {
  await enforce(principal, 'handle_support', deskResource(id));
  const input = deskReplySchema.parse(raw);
  const agentId = principal!.userId;
  await withSystemTx(async (tx) => {
    const t = await loadDeskTicket(tx, id);
    const [msg] = await tx.insert(schema.supportTicketMessages).values({ ticketId: id, tenantId: t.tenantId, authorId: agentId, authorSide: 'azentio', body: input.body }).returning();
    await audit(tx, { actorId: agentId, action: 'support.agent_reply', resourceType: 'support_ticket', resourceId: id, tenantId: t.tenantId, meta: { messageId: msg.id } });
    const to = input.status ?? (t.status === 'closed' ? 'closed' : 'waiting_on_client');
    const changed = await changeStatus(tx, agentId, t, to);
    if (!changed) {
      await tx.update(schema.supportTickets).set({ updatedAt: new Date() }).where(and(eq(schema.supportTickets.id, id)));
      await notify(tx, { userId: t.createdBy, type: 'support_reply', title: `Azentio support replied: ${t.subject}`, link: `/w/_/support/${t.id}`, dedupeKey: `support:${t.id}:reply:${msg.id}` });
    }
  });
  return { ok: true };
}

export async function setTicketStatus(principal: Principal | null, id: string, raw: unknown) {
  await enforce(principal, 'handle_support', deskResource(id));
  const { status } = ticketStatusSchema.parse(raw);
  return withSystemTx(async (tx) => {
    const t = await loadDeskTicket(tx, id);
    await changeStatus(tx, principal!.userId, t, status);
    return { ok: true, status };
  });
}
