# azentio.ai: website and intelligent collaboration portal

This is a hackathon build of the azentio.ai public website and secure collaboration portal. It covers public discovery, an employee hub, isolated client workspaces, a moderated **collective learning hub** (with withdrawal) and the **improvement loop**.

> **Public website content is real azentio.ai content.** The 8 products, their capabilities, steps and outcomes, the solutions, About, AI Lab, Technology, Insights and Media pages come from the reference azentio.ai site named in the brief. Company background on /about comes from public profiles of Azentio Software. It all lives in `scripts/azentio-catalogue.ts`, is seeded into the CMS tables, and renders from the database. Homepage stats and the theme preview are live queries.
>
> **Portal data is synthetic, as the brief requires.** Client organisations, people, observations and customers are fictional, and client emails use the reserved `.example` domain.

## Quick start

```bash
cp .env.example .env.local        # set AUTH_SECRET; DEMO_MODE=1 is on by default
npm run setup                     # install and seed (embedded Postgres; no Docker needed)
npm run dev                       # http://localhost:3000
```

Open **/login**. In demo mode, a panel of synthetic personas sends real magic links through the same flow as production. Open each link from **/dev/mailbox**, which lists queued emails in demo mode only.

| Persona | Email | What they can do |
|---|---|---|
| Employee | alex.employee@azentio.com | Hub, Playground, Live, experiments. Has no admin rights. |
| Content publisher | priya.publisher@azentio.com | Edits the banner and broadcast audiences |
| Learning moderator | maya.moderator@azentio.com | Uses the queue and handles reports |
| Product owner | omar.owner@azentio.com | Manages ideas linked to approved evidence |
| Portal admin | ada.admin@azentio.com | Manages orgs, entitlements, grants, settings and the audit log |
| Pending employee | sam.pending@azentio.com | Verified identity but not on the allow-list, so access is pending |
| Northwind admin / member | nina.admin@ / noah.analyst@northwind.example | Client workspace and team admin |
| Harbor / Meridian members | hugo.analyst@harbor.example, max.analyst@meridian.example | Other tenants |
| Consultant | cara.consultant@advisory.example | Belongs to two orgs, which shows the workspace switcher |

To reset everything, run `npm run db:reset` with the dev server stopped. Alternatively, use **Admin → Settings → Reset demo data**.

## Architecture

- **Stack:** Next.js 15 (App Router, TypeScript strict), Tailwind v4, Motion, Zod, Drizzle and Postgres.
- **Database:** embedded **PGlite** by default. PGlite is real Postgres compiled to WASM, including RLS and full-text search. Set `DATABASE_URL` to use managed Postgres (Neon or Supabase) with the same migrations.
- **`lib/policy/authorize.ts`:** the single access decision. It is pure and checks, in order:
  1. session
  2. explicit audience (a missing audience is denied)
  3. whether the audience admits the principal
  4. active tenant and membership, taken from the server session only
  5. the action's grant
  6. product entitlement

  `enforce()` adds auditing of denials. Every route handler, page loader and media route goes through a service that calls it.
- **Row-Level Security** (`db/migrations/0001_rls.sql`) is the second layer:
  - Every query runs as a non-superuser `app_user` role with transaction-local `app.user_id`, `app.tenant_id` and `app.mode` settings.
  - Policies also require an active membership in the context tenant, so even a forged tenant context returns zero rows.
  - Moderators can never select drafts, private records or organisation-only records.
  - `audit_events` and `consents` are append-only: the role has no UPDATE or DELETE on them.
- **The private record and the shared copy are separate tables.**
  - `observations` holds the private source.
  - `shared_insights` holds only the reviewed fields.
  - `toSharedInsightDTO()` is an explicit allow-list, and a test fails if tenant, author or reviewer fields ever appear in it.
- **Public routes** follow the reference site: `/products`, `/products/[slug]`, `/solutions`, `/lab`, `/technology`, `/media`, `/insights` and `/about`. `/offerings` and `/connect` redirect.
- **Search** uses Postgres full-text search, partitioned by `audience_key` (public, shared community, employee, or a single tenant). Results are filtered by partition *before* ranking and then by the withdrawal blocklist. The reported count is always the length of the visible results.
- **AIRA** uses the same retrieval. With `ANTHROPIC_API_KEY` set, it streams a grounded answer from `claude-opus-5-5` with server-side refusal fallbacks enabled. Otherwise it answers extractively, citing the source. Only permitted snippets are ever sent to the model. With no citation, it replies "I don't have approved information on that."
- **Notifications** use outbox records with a dedupe key. In-app delivery is the stored notification. Email stays `queued` until a provider accepts it (`sent`). It is labelled `delivered` only on provider confirmation.

## Authentication

### Employees: Microsoft Entra ID

Employees sign in through OIDC (authorization code with PKCE, single tenant):

- The `id_token` is verified with JWKS: signature, audience, expiry and issuer.
- `validateEntraClaims()` then requires `tid` and `iss` to match the Azentio tenant, plus a matching nonce and an `oid`.
- Users are keyed on `oid`; the email address is display-only.
- Portal access also needs the allow-list or an Entra group. Without either, the user lands on **/access-pending** and admins are notified.
- Signing out also ends the Entra session.

**Entra app registration:**

1. Create a single-tenant registration.
2. Add the web redirect `${APP_URL}/api/auth/microsoft/callback`.
3. Create a client secret.
4. Allow the scopes `openid profile email offline_access`.
5. Optionally, add a `groups` claim for `EMPLOYEE_GROUP_ID`.
6. Set `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET` and `AZURE_AD_TENANT_ID`.

If the Azentio tenant isn't available, point these at a developer tenant with synthetic users.

### Magic links

Magic links serve two purposes: the employee fallback (switchable in config, and the allow-list is still required) and client sign-in.

- They are single-use (an atomic consume), expire after 15 minutes, and are stored only as an HMAC.
- Consuming one requires a POST, so mail-scanner GETs can't burn the token.
- Requests are rate-limited, and repeated failures cause a lockout.
- The endpoint never reveals whether an account exists.

### Client invitations

- Each invitation is single-use, expires after 7 days, is bound to one email and is stored as a hash.
- The invitee must verify that exact address.
- They then review the workspace terms and the sharing explainer before joining. Joining is not consent to share or train.

### Sessions

- Sessions are stored in the database, with httpOnly cookies, SameSite=Lax, a 30-minute idle timeout and a 12-hour absolute timeout.
- Any change to a user's grants, role or membership deletes their sessions.

## Policies to document for production

- **Withdrawal:**
  - Withdrawal happens synchronously in a single transaction:
    1. The shared copy is marked withdrawn.
    2. The search documents are deleted.
    3. The item is added to the retrieval blocklist.
    4. Theme counts are computed live from published copies.
    5. Audit and notification records are written.
  - The UI then independently verifies, with a live timer, that the feed, search and AIRA no longer return the item.
  - **Production propagation SLA: 5 minutes across all replicas and caches.**
  - Already-viewed or copied material cannot be recalled, and withdrawal does not "untrain" anything.
- **k-threshold:**
  - The default is 3 distinct organisations, configurable in Admin → Settings with a minimum of 3. Repeated posts from one organisation count once.
  - Counts appear only as bands (3–5, 6–10, 10+).
  - A filter is disabled, and refused on the server, if its slice has fewer than k organisations or its complement has between 1 and k−1. This blocks differencing.
  - The production threshold and suppression policy must be approved before launch. A minimum cohort size is not a privacy guarantee.
- **Consent:** four separate, versioned, append-only permissions:
  - store and process
  - publish a shared version
  - attribution
  - a future training programme
- **Support access:** admins cannot see client content by default. A `support_access` grant is scoped to one org, lasts at most 8 hours, requires a reason, and every view is audited.

## Tests

```bash
npm test                                         # 50 unit + DB security tests (in-memory Postgres with RLS)
npm run build && npm start                       # then, in another terminal:
E2E_BASE_URL=http://localhost:3000 npm run test:api   # 8 HTTP tests: real magic-link login, CSRF, forged tenants, headers
npm run test:ui                                  # Playwright (system Chrome): AT-21 + full UI demo flow
```

Seed a fresh database before running the HTTP and UI suites. Magic-link requests are rate-limited at 5 per email per 15 minutes.

| Acceptance test | Where it is covered |
|---|---|
| AT-01 anonymous broadcast or media (401, signed URL refused) | unit, security, HTTP |
| AT-02 cross-tenant access with a forged tenant (403/404, RLS returns 0 rows) | unit, security, HTTP |
| AT-03 no audience means denied | unit, security |
| AT-04 banner edit without a grant (403) | unit, security |
| AT-05 client admin granting moderator or employee (rejected and audited) | security |
| AT-06 invitation reused, expired or used by the wrong email | security |
| AT-07 save creates a private draft | security, UI |
| AT-08 queue has no drafts (app and RLS) | security |
| AT-09 shared payload has no private fields | unit, security |
| AT-10 material edit creates a new version; role change revokes sessions | security |
| AT-11 withdrawal clears feed, search and AIRA | security, UI |
| AT-12 two orgs (posts counted once) shows as Emerging; a third org crosses k | security, UI |
| AT-13 below-k filters disabled | unit, security |
| AT-14 client asking AIRA about employee-only content | security, HTTP |
| AT-15 count equals visible results | security, HTTP |
| AT-16 idea status change is audited and contributors notified | security |
| AT-17 without a provider, email stays "queued" | security, HTTP |
| AT-18 Entra `tid` mismatch is rejected | unit |
| AT-19 unlisted Azentio identity goes to access-pending | security |
| AT-20 non-admin opening admin (403) | security, HTTP |
| AT-21 reduced motion | UI |

## Seven-minute demo script

1. **Public site.** Show the hero, the product-family explorer (8 real products), Trust by Design, the live theme preview and AIRA (public sources only). Submit a demo request.
2. **Employee hub.** Log in as the Employee to show the hub. Then log in as Pending employee to show **Identity verified · access pending**.
3. **Northwind admin, Team page.** Invite a colleague and copy the link. Try the "Learning moderator" role: the server rejects it, and the denial appears in Admin → Audit log under Denials.
4. **Meridian member.** Create a new observation. The live "who can see this" preview and sensitive-content flags are visible. Save the private draft, choose Community and grant the consents, then submit.
5. **Moderator.** The queue shows proposals only. Open the seeded *Ramadan-season* item, where the customer name is highlighted and the redaction suggestions are pre-filled. Check the diff, choose the Seasonality theme and approve. In the community page, **Seasonality context** now crosses k = 3 and shows "3–5 contributing organisations".
6. **Product owner.** Go to Ideas, create an idea linked to the seasonality evidence, then set it to Under review. Contributors are notified, and client workspaces show the idea's status on the Ideas page.
7. **Security moment.** As a client, open another tenant's observation URL: the server returns 403/404. Ask AIRA about "Project Lighthouse": it answers "I don't have approved information".
8. **Withdrawal.** As the author, withdraw the published item. A live timer shows the feed, search and AIRA each clearing.

## Where this departs from the spec, and known limitations

- **Auth.js was not used.** OIDC with PKCE and the sessions are implemented directly (`lib/auth/*`, built on `jose`), which gives direct control of claim checks and session revocation. Entra sign-in is implemented but **untested against a live tenant** in this environment, because no credentials were available. The claim validator is unit-tested.
- **Admin MFA (AUTH-12):** admin writes require an `mfa` claim from within the last hour for Microsoft sessions. Magic-link demo sessions are exempt and labelled as such.
- **Hero animation:** the hero uses SVG and CSS rather than React Three Fiber, so it is LCP-safe with no WebGL. The learning journey uses Framer rather than a pinned GSAP scroll story.
- **Search:** there are no vector embeddings (pgvector), because no embedding provider is configured. Search is full-text with the same audience partitioning.
- **Not implemented:**
  - attachments (OBS-09); links in the body text are the alternative
  - comments, bookmarks and saved searches (CLI-08 and CLI-09)
  - digests
  - the ⌘K command palette
  - a light theme
  - semantic clustering; theme suggestion is topic-based
  - the optional federated-learning track (P2)
- **Dev mailbox:** `/dev/mailbox` exposes sign-in links and exists **only when `DEMO_MODE=1`**. Never enable it in production.
- **Lighthouse and WCAG:** Lighthouse scores and a full WCAG audit have not been measured yet. The build includes skip links, visible focus rings, 44px targets, labelled controls, `aria-live` regions and reduced-motion handling.
- **Concurrency:** embedded PGlite is single-process. Use `DATABASE_URL` for multi-instance hosting.
