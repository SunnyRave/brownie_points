/** Shared, dependency-free labels for support tickets (safe to import from client components). */
export const TICKET_CATEGORIES = ['access', 'product_question', 'sandbox', 'contribution', 'other'] as const;
export const TICKET_PRIORITIES = ['low', 'normal', 'high'] as const;
export const TICKET_STATUSES = ['open', 'in_progress', 'waiting_on_client', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const CATEGORY_LABELS: Record<(typeof TICKET_CATEGORIES)[number], string> = {
  access: 'Access & sign-in',
  product_question: 'Product question',
  sandbox: 'Demo / sandbox',
  contribution: 'Contribution or moderation',
  other: 'Something else',
};
export const PRIORITY_LABELS: Record<(typeof TICKET_PRIORITIES)[number], string> = { low: 'Low', normal: 'Normal', high: 'High' };
export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_on_client: 'Waiting on client',
  resolved: 'Resolved',
  closed: 'Closed',
};
export const STATUS_TONE: Record<TicketStatus, string> = {
  open: 'border-accent/40 text-accent',
  in_progress: 'border-violet/40 text-violet-text',
  waiting_on_client: 'border-amber/40 text-amber',
  resolved: 'border-teal/40 text-teal',
  closed: 'text-muted',
};
export const FLAG_LABELS: Record<string, string> = {
  iban: 'IBAN', card_number: 'card number', account_number: 'account number', email: 'email address', phone: 'phone number',
  currency_with_name: 'named amount', confidential_term: 'confidential term', customer_name: 'customer name',
};
