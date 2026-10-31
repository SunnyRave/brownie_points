import { eq } from 'drizzle-orm';
import { schema, type Tx } from '@/lib/db';
import type { Refs } from './refs';

/** Synthetic public enquiries (.example addresses are never emailed). */
export async function seedEnquiries(tx: Tx, refs: Refs) {
  const fai = refs.offerings['financial-analysis'];
  const docs = refs.offerings['document-intelligence'];
  const day = (d: number) => new Date(Date.now() - d * 86400_000);
  await tx.insert(schema.leads).values([
    { name: 'Lena Fischer', email: 'lena.fischer@kestrelbank.example', company: 'Kestrel Bank', offeringInterest: fai?.id ?? null, message: 'Interested in seasonality-aware spreading for our SME book.', consent: true, status: 'new', createdAt: day(1), updatedAt: day(1) },
    { name: 'Tomás Reyes', email: 'tomas.reyes@solcredit.example', company: 'Sol Credit Cooperative', offeringInterest: docs?.id ?? null, message: 'Can we see multi-document pack handling?', consent: true, status: 'contacted', createdAt: day(4), updatedAt: day(2) },
    { name: 'Aisha Bello', email: 'aisha.bello@lagoonfinance.example', company: 'Lagoon Finance', offeringInterest: null, message: null, consent: true, status: 'closed', createdAt: day(9), updatedAt: day(6) },
  ]);
  const [ev] = await tx.select().from(schema.events).where(eq(schema.events.slug, 'hackathon-2026')).limit(1);
  if (!ev) return;
  await tx.insert(schema.eventRegistrations).values([
    { eventId: ev.id, name: 'Ravi Menon', email: 'ravi.menon@builders.example', team: 'Ledger Lights', status: 'registered', createdAt: day(6) },
    { eventId: ev.id, name: 'Jo Park', email: 'jo.park@builders.example', team: 'Ledger Lights', status: 'registered', createdAt: day(5) },
    { eventId: ev.id, name: 'Sofia Lindqvist', email: 'sofia.l@builders.example', team: null, status: 'registered', createdAt: day(3) },
  ]).onConflictDoNothing();
}
