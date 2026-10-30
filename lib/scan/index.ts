import type { SensitiveFlag } from '@/lib/db/schema';

/** Names from the synthetic customer list used in demo data. A real deployment would use a managed list. */
export const SYNTHETIC_CUSTOMER_NAMES = ['Brightwater Bakery', 'Coastal Freight Ltd', 'Juniper Farms', 'Okafor Textiles', 'Lumen Retail Group', 'Patel & Sons Hardware'];

const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'iban', re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g },
  { kind: 'card_number', re: /\b(?:\d[ -]?){13,19}\b/g },
  { kind: 'account_number', re: /\b\d{8,12}\b/g },
  { kind: 'email', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { kind: 'phone', re: /(?:\+\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]\d{3,4}[\s-]\d{3,4}\b/g },
  { kind: 'currency_with_name', re: /\b(?:[A-Z][a-z]+\s){1,3}(?:[A-Z][a-z]+)?\s*(?:owes|paid|borrowed|received)?\s*(?:[$€£]|USD|EUR|GBP|AED|INR)\s?\d[\d,.]*(?:k|m|bn)?\b/g },
  { kind: 'confidential_term', re: /\b(?:confidential|pricing|price list|contract(?:ual)?|NDA|secret|password|credential)s?\b/gi },
];

/**
 * Flags (never blocks) likely sensitive content for moderator review.
 * UI copy: "This check helps, but it can't guarantee privacy."
 */
export function scanSensitive(fields: { title: string; body: string }): SensitiveFlag[] {
  const flags: SensitiveFlag[] = [];
  for (const field of ['title', 'body'] as const) {
    const text = fields[field];
    const taken: [number, number][] = [];
    for (const { kind, re } of PATTERNS) {
      for (const m of text.matchAll(re)) {
        const start = m.index ?? 0;
        const end = start + m[0].length;
        if (taken.some(([s, e]) => start < e && end > s)) continue;
        taken.push([start, end]);
        flags.push({ kind, match: m[0], start, end, field });
      }
    }
    for (const name of SYNTHETIC_CUSTOMER_NAMES) {
      const idx = text.toLowerCase().indexOf(name.toLowerCase());
      if (idx >= 0) flags.push({ kind: 'customer_name', match: text.slice(idx, idx + name.length), start: idx, end: idx + name.length, field });
    }
  }
  return flags;
}

/** Generalisation helpers used to pre-fill the moderator's shared copy. */
const CITY_TO_REGION: Record<string, string> = {
  london: 'Europe', manchester: 'Europe', leeds: 'Europe', paris: 'Europe', frankfurt: 'Europe', dublin: 'Europe',
  dubai: 'Middle East', riyadh: 'Middle East', doha: 'Middle East', 'abu dhabi': 'Middle East',
  mumbai: 'Asia Pacific', bengaluru: 'Asia Pacific', chennai: 'Asia Pacific', singapore: 'Asia Pacific', jakarta: 'Asia Pacific',
  lagos: 'Africa', nairobi: 'Africa', johannesburg: 'Africa', cairo: 'Africa',
  toronto: 'North America', chicago: 'North America', 'new york': 'North America',
};

export function generaliseRegion(region: string | null | undefined): string | null {
  if (!region) return null;
  const key = region.trim().toLowerCase();
  for (const [city, r] of Object.entries(CITY_TO_REGION)) if (key.includes(city)) return r;
  return region;
}

export function toQuarter(date: string | null | undefined): string | null {
  if (!date) return null;
  const [y, m] = date.split('-').map(Number);
  return `${y} Q${Math.floor((m - 1) / 3) + 1}`;
}

export function generalisePeriod(start: string | null | undefined, end: string | null | undefined): string | null {
  const a = toQuarter(start);
  const b = toQuarter(end);
  if (!a) return b;
  if (!b || a === b) return a;
  return a.slice(0, 4) === b.slice(0, 4) ? `${a}–${b.slice(5)}` : `${a} – ${b}`;
}

/** Replace flagged spans and city names with neutral placeholders. Moderators review the result. */
export function suggestRedaction(text: string): string {
  let out = text;
  for (const name of SYNTHETIC_CUSTOMER_NAMES) out = out.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&'), 'gi'), '[a customer]');
  out = out.replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}\b/g, '[account]').replace(/\b\d{8,19}\b/g, '[number]');
  out = out.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]');
  for (const city of Object.keys(CITY_TO_REGION)) out = out.replace(new RegExp(`\\b${city}\\b`, 'gi'), `[${CITY_TO_REGION[city]}]`);
  return out;
}
