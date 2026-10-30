import { beforeAll, describe, expect, it } from 'vitest';

/**
 * HTTP-level security tests against a running server (DEMO_MODE=1, freshly seeded):
 *   npm run build && npm start   # in another terminal
 *   E2E_BASE_URL=http://localhost:3000 npm run test:api
 * Logs in through the real magic-link flow (request → dev outbox → POST consume).
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const ORIGIN = { Origin: BASE };

async function login(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/magic-link`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...ORIGIN }, body: JSON.stringify({ email }) });
  expect(r.status).toBe(200);
  const body = await r.json();
  expect(body.status).toBe('queued'); // never "sent"/"delivered"
  const mailbox = await (await fetch(`${BASE}${body.devMailbox}`)).text();
  const token = mailbox.match(/login\/verify\?token=([\w-]+)/)?.[1];
  expect(token).toBeTruthy();
  const form = new URLSearchParams({ token: token!, next: '' });
  const c = await fetch(`${BASE}/api/auth/magic-link/consume`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...ORIGIN }, body: form, redirect: 'manual' });
  expect(c.status).toBe(303);
  const cookie = c.headers.get('set-cookie')?.match(/az_session=([^;]+)/)?.[1];
  expect(cookie).toBeTruthy();
  // Single use: a second consume of the same token fails.
  const again = await fetch(`${BASE}/api/auth/magic-link/consume`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...ORIGIN }, body: form, redirect: 'manual' });
  expect(again.headers.get('location')).toContain('error=link_invalid');
  return `az_session=${cookie}`;
}

const get = (path: string, cookie?: string, headers: Record<string, string> = {}) => fetch(`${BASE}${path}`, { headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers }, redirect: 'manual' });
const post = (path: string, body: unknown, cookie?: string, headers: Record<string, string> = ORIGIN) =>
  fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: JSON.stringify(body) });

let northwind: string, harbor: string, employee: string;

beforeAll(async () => {
  northwind = await login('noah.analyst@northwind.example');
  harbor = await login('hugo.analyst@harbor.example');
  employee = await login('alex.employee@azentio.com');
});

describe('HTTP access control', () => {
  it('AT-01: anonymous employee broadcast + media → 401; forged signed URL refused', async () => {
    const list = await (await get('/api/broadcasts', employee)).json();
    const internal = list.items.find((b: { audienceKind: string }) => b.audienceKind === 'employee');
    expect((await get(`/api/broadcasts/${internal.id}`)).status).toBe(401);
    expect((await get(`/api/media/${internal.recordingMediaId}`)).status).toBe(401);
    expect((await get(`/api/media/file/${internal.recordingMediaId}?exp=9999999999&sig=forged`)).status).toBe(403);
    expect((await get(`/api/broadcasts/${internal.id}`, northwind)).status).toBe(403);
    const signed = await (await get(`/api/media/${internal.recordingMediaId}`, employee)).json();
    const file = await get(signed.url);
    expect(file.status).toBe(200);
    expect(file.headers.get('cache-control')).toContain('no-store');
  });

  it('AT-02: Client A requesting Client B observation with forged tenant header/cookie → 403/404, never data', async () => {
    const mine = await (await get('/api/observations', harbor)).json();
    const harborId = mine.items[0].id;
    const forged = await get(`/api/observations/${harborId}`, `${northwind}; tenant_id=harbor`, { 'X-Tenant-Id': 'harbor', 'X-Org-Id': 'harbor' });
    expect([403, 404]).toContain(forged.status);
    expect(JSON.stringify(await forged.json())).not.toContain(mine.items[0].title);
    // Switching to an org you don't belong to is refused.
    const harborOrgId = 'not-a-member-org';
    expect((await post('/api/session/workspace', { orgId: harborOrgId }, northwind)).status).toBe(403);
  });

  it('anonymous calls to protected APIs are 401, not data', async () => {
    for (const p of ['/api/observations', '/api/community', '/api/themes', '/api/team', '/api/moderation/queue', '/api/admin/overview']) {
      expect((await get(p)).status, p).toBe(401);
    }
  });

  it('AT-20: non-admin employee → 403 on admin API; client → 403 on moderation', async () => {
    expect((await get('/api/admin/overview', employee)).status).toBe(403);
    expect((await get('/api/moderation/queue', northwind)).status).toBe(403);
  });

  it('CSRF: state-changing request without a same-origin Origin header is refused', async () => {
    const r = await post('/api/observations', { title: 'x' }, northwind, { Origin: 'https://evil.example' });
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe('csrf_origin_mismatch');
  });

  it('AT-14: client AIRA cannot surface employee-only content', async () => {
    const r = await post('/api/aira', { question: 'Project Lighthouse' }, northwind);
    const text = await r.text();
    expect(text).toContain("don't have approved information");
    expect(text).not.toMatch(/Lighthouse prototype|employee_content|\/hub\//);
  });

  it('AT-15: search count equals visible results; public search excludes community', async () => {
    const s = await (await get('/api/search?q=seasonal', northwind)).json();
    expect(s.count).toBe(s.results.length);
    const pub = await (await get('/api/search?q=multi-document')).json();
    expect(pub.results.every((r: { url: string }) => !r.url.startsWith('/community/'))).toBe(true);
  });

  it('security headers present', async () => {
    const r = await get('/');
    expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(r.headers.get('strict-transport-security')).toContain('max-age');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
