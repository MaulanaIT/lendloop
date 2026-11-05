# LendLoop

**Borrow what you need. Lend what you don't.**

LendLoop is a tool-lending board for a neighborhood. Neighbors list tools they
rarely use, request to borrow each other's tools for a date range, and the owner
approves, declines and finally marks the tool returned. n8n sends the
notifications and the daily overdue reminders, and reports every outcome back to
Convex, so each loan shows its own automation history.

Stack: Next.js 16 (App Router) · React 19 · Tailwind v4 · Clerk · Convex ·
n8n 2.46 + Mailpit (Docker) · TypeScript · Vitest + convex-test.

More detail:

- [`docs/integration.md`](docs/integration.md): the Convex ↔ n8n contract, signing, retries, idempotency and failure handling
- [`docs/production.md`](docs/production.md): what I'd change to run this in production
- [`docs/design-notes.md`](docs/design-notes.md): design rationale, the prototype's annotations, scope cuts and where the build differs from the prototype

## Screenshots

> Placeholder. Screenshots of the running app are still to be added. The design
> prototype's renders are in [`design-references/screenshots/`](design-references/screenshots/),
> and the clickable prototype is `design-references/LendLoop.dc.html`.

| Screen | Prototype reference |
|---|---|
| Browse tools (`/tools`) | `design-references/screenshots/01-browse.jpg`, `02-browse.jpg` |
| Tool detail + request panel (`/tools/[id]`) | `detail.jpg`, `01-detail2.jpg` … `04-detail2.jpg` |
| List / edit a tool (`/tools/new`) | `01-form.jpg` … `03-form.jpg` |
| My requests (`/me/requests`) | `01-requests.jpg` … `03-requests.jpg` |
| My listings (`/me/listings`) | `listings.jpg` |

## Feature tour

**Visitor** (`/`)
- Hero with the tagline, "How it works", and an **Available now** grid fed by
  `tools.listPublic`. Each card shows only the tool's name and category, with
  category chips to filter. There is no owner, description or availability detail.
- **Sign in to lend or borrow** opens Clerk's sign-in modal. Once signed in it
  reads "Go to the board". Every app route (`/tools`, `/me`, `/loans`, `/admin`)
  redirects visitors to `/sign-in`.

**Member** (any signed-in user)
- **Browse** (`/tools`): every live tool with its availability (Available,
  Booked from …, On loan), category chips, search and an "Available only" switch.
  All filters live in the URL.
- **List / edit a tool** (`/tools/new`, `/tools/[id]/edit`): name, category
  (power tools, hand tools, garden, kitchen, camping, cleaning, ladders & moving,
  other), condition, and a short description, with a live preview card.
  Owners can edit and delete only their own listings. Delete is blocked while the
  tool is lent out or booked.
- **Request to borrow** (`/tools/[id]`): a calendar that blocks booked days,
  1–14 days, starting today or later. Your own tool, a second pending request
  and taken dates are refused on the server.
- **My listings** (`/me/listings`): each tool with who has it and until when,
  pending count, "Mark returned →", and listings an admin removed (with the reason).
- **My requests** (`/me/requests`): Active / History tabs, a pinned overdue
  banner, "I've returned it" (notifies the owner), cancel a pending request or an
  approved booking before it starts, and the owner's email once approved.
- **Incoming requests** (`/me/incoming`): Needs response / Active & upcoming /
  Overdue / History. Approve (with an overlap warning: approving declines
  overlapping pending requests as "Dates taken"), decline with a preset reason,
  mark returned.
- **Loan detail** (`/loans/L-1042`): people, dates, status, the actions the
  server allows, and the **activity timeline**: human events, derived events
  ("Loan became overdue") and every automation (e.g. "Overdue reminder sent to
  borrower · today 09:02 · Sent"). Loan rows elsewhere show the latest automation
  line, e.g. "Reminder sent 2 days ago".

**Admin**
- Everything a member can do with their own tools and loans.
- **Loans** (`/admin/loans`): every loan, read-only, with status filters. Opening
  one shows an "Admin view · read-only" ribbon.
- **Listings** (`/admin/listings`): remove any listing (soft remove, reason
  required). Pending requests and bookings that haven't started are cancelled and
  their borrowers notified. A loan that is already out stays open until returned.
- **Users** (`/admin/users`): grant or revoke **Trusted Lender**, but not on
  yourself. There is no role editor on purpose.
- **Automation** (`/admin/automation`): delivery log (status, attempts, error
  category, idempotency key, execution ID, field *names* sent), reminder runs,
  workflow errors, a Configuration card that shows only whether each secret is
  set, **Retry now** for failed deliveries, and links to the n8n execution. A red
  badge on the Admin nav and a banner appear when there were failures in the last
  24 h that no retry fixed.

## Architecture

```
 Browser
 ┌──────────────────────────────┐
 │ Next.js 16 App Router (UI)   │  proxy.ts: Clerk route gate (UX only)
 │ Clerk (session, sign-in UI)  │
 └──────────────┬───────────────┘
                │ Convex React client (websocket) + Clerk JWT (template "convex")
                ▼
 ┌─────────────────────────────── Convex ────────────────────────────────┐
 │ queries     tools.*, loans.*, users.*, admin.*   (projected DTOs)      │
 │ mutations   every one starts with requireViewer / requireAdmin         │
 │             state change + deliveries row in ONE transaction           │
 │ scheduler   notifications.send ── signed POST ─────────────────────────┼──┐
 │             (retries 30 s / 2 min)              N8N_WEBHOOK_SECRET      │  │
 │ crons       clock.tick (hourly), notifications.expireStale (5 min)     │  │
 │ http        POST /n8n/overdue-loans   ◀── signed fetch ────────────┐   │  │
 │ actions     POST /n8n/deliveries      ◀── write-backs ──────────┐  │   │  │
 │             POST /n8n/reminder-runs   ◀── run summary ───────┐  │  │   │  │
 │             POST /n8n/errors          ◀── error workflow ─┐  │  │  │   │  │
 │             (verify CONVEX_INBOUND_SECRET)                │  │  │  │   │  │
 └───────────────────────────────────────────────────────────┼──┼──┼──┼───┘  │
                                                             │  │  │  │      │
 ┌──────────────────────────── n8n (Docker) ─────────────────┼──┼──┼──┼───┐  │
 │ Request notifications   webhook ◀──────────────────────────────────────┼──┘
 │   verify HMAC → 401/400/202 → email (3 tries) → write-back ┘  │  │  │   │
 │ Overdue reminders       daily 09:00 → fetch ──────────────────┼──┼──┘   │
 │   email per loan → write-back per loan ───────────────────────┼──┘      │
 │   run summary ────────────────────────────────────────────────┘         │
 │ Error handler           errorWorkflow of both → categorize → report     │
 └──────────────────────────────┬──────────────────────────────────────────┘
                                │ SMTP :1025
                                ▼
                     Mailpit (local inbox, UI :8025)
```

- **Convex holds all state and every rule.** n8n holds no state of its own: it
  only delivers messages and reports back. Overdue is derived from the dates
  (`approved` and `endDate < today` in the neighborhood timezone), never stored.
- **One shared contract.** `lib/domain/*` is pure TypeScript used by both Convex
  and the UI: status derivation, availability, date rules, error codes, DTOs and
  the n8n wire types. The header of `lib/domain/dto.ts` lists the whole API.
- **Realtime.** Pages subscribe to Convex queries, so an approval, a write-back
  from n8n or a new incoming request shows up without a reload. An hourly clock
  row lets "overdue" flip at midnight for open subscriptions.

Data model (`convex/schema.ts`): `users`, `tools`, `loans`, `loanEvents` (human
timeline), `deliveries` + `deliveryAttempts` (automation log), `reminderRuns`,
`workflowErrors`, `clock`, `counters` (loan refs `L-1042`).

### Repo layout

```
app/
  (public)/page.tsx            landing
  (app)/tools, me, loans, admin  signed-in screens (client components on Convex queries)
  sign-in, sign-up             Clerk pages
components/
  ui/                          shadcn-style primitives (Radix + Tailwind)
  lendloop/                    app components: tools/, loans/, admin/, timeline, badges, shell
convex/
  users.ts tools.ts loans.ts admin.ts   public API (RBAC in every function)
  notifications.ts             outbound pipeline: payload → sign → POST → retry / sweep
  http.ts  n8n.ts              inbound n8n endpoints + idempotent write-backs
  crons.ts clock.ts seed.ts    schedules, clock tick, demo data
  lib/                         auth guards, projections (loanViews, people), notify, stats
  *.test.ts                    convex-test suites
lib/
  domain/                      shared pure domain + contract (dto.ts, automation.ts, signing.ts, …)
  copy.ts toast.ts hooks/      UI copy, toasts, hooks (viewer, URL filters, queries)
n8n/
  workflows/*.json             exported workflows (no secrets)
  credentials/mailpit-smtp.json  local Mailpit SMTP (no user, no password)
  init/import.sh               imports + publishes on `docker compose up`
  defaults.env  .env.example   non-secret defaults, secret template
scripts/                       setup-n8n-env.sh, sign-and-send.mjs, mock-n8n-webhook.mjs
docs/                          integration.md, production.md, design-notes.md
design-references/             design prototype + screenshots
docker-compose.yml             n8n 2.46.6 + Mailpit v1.33.0 (+ one-shot n8n-init)
proxy.ts                       Clerk middleware (Next 16 "proxy")
```

## Local setup

### Prerequisites

- Node.js 20.9+ (22 LTS recommended) and npm
- Docker Desktop (or Docker Engine with Compose v2)
- A free Clerk account (a development instance is enough)
- `openssl` (used by `scripts/setup-n8n-env.sh`)

### 1. Install

```sh
git clone <repo-url> lendloop && cd lendloop
npm install
cp .env.example .env.local
```

### 2. Clerk

1. Create an application in the [Clerk dashboard](https://dashboard.clerk.com)
   with **Email** sign-in enabled (email verification on, which is the default).
2. Activate Clerk's **Convex integration** (Clerk docs → "Integrate Convex with
   Clerk"), or create a JWT template from the "Convex" preset. The template must
   be named **`convex`** (the Convex client asks for it, and its `aud` is what
   `convex/auth.config.ts` expects) and must carry the `email` and
   `email_verified` claims (the preset does).
3. Copy the **Frontend API URL** (e.g. `https://your-app-12.clerk.accounts.dev`).
   That is the issuer domain for Convex, set in step 3.
4. Put the API keys in `.env.local`:
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. The sign-in/up URL
   variables are already filled in by `.env.example`.

### 3. Convex

```sh
npx convex dev
```

On a fresh clone this asks how to run Convex. Choose **local deployment** (no
account needed; the backend runs on `http://127.0.0.1:3210`, HTTP actions on
`:3211`) or log in and create a cloud dev deployment. It writes
`CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL`
into `.env.local`. Keep it running: it pushes functions and regenerates types on
every save.

In a second terminal, set the Convex environment (if `convex dev` is stopping on
"CLERK_JWT_ISSUER_DOMAIN … not set", this is what it's waiting for):

```sh
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app-12.clerk.accounts.dev
npx convex env set APP_TIME_ZONE Asia/Jakarta
```

**Local vs cloud Convex and n8n.** With a *local* Convex backend, n8n (in Docker)
reaches Convex at `http://host.docker.internal:3211` and Convex reaches n8n at
`http://localhost:5678`; this is the default wiring. With a *cloud* Convex
deployment, n8n can call the public `https://<deployment>.convex.site` (set
`CONVEX_SITE_URL` in `n8n/.env`), but Convex can't reach `localhost:5678`. You
then need a tunnel (e.g. `cloudflared` or `ngrok`) to the n8n webhook, and
`N8N_REQUEST_WEBHOOK_URL` must point at the tunnel. Expose only
`/webhook/lendloop/*`, never the n8n editor.

### 4. Seed demo data

```sh
npm run seed                                   # = npx convex run seed:run
npx convex run seed:run '{"force": true}'      # wipe the app tables and reseed
```

The seed (6 neighbors, 14 tools, 13 loans, deliveries, reminder runs) comes from
the design brief. All dates are shifted so the brief's "today" (Nov 5) is your
real today, so "Overdue · 2 days" and "Booked from …" stay true whenever you
seed. Seeded deliveries are history only; seeding never calls n8n.

### 5. n8n + Mailpit

```sh
sh scripts/setup-n8n-env.sh        # once: writes n8n/.env (gitignored) with random secrets

# copy the two shared secrets and the webhook URL into Convex
npx convex env set N8N_WEBHOOK_SECRET    "$(grep ^N8N_WEBHOOK_SECRET= n8n/.env | cut -d= -f2)"
npx convex env set CONVEX_INBOUND_SECRET "$(grep ^CONVEX_INBOUND_SECRET= n8n/.env | cut -d= -f2)"
npx convex env set N8N_REQUEST_WEBHOOK_URL http://localhost:5678/webhook/lendloop/request-events
npx convex env set N8N_EDITOR_BASE_URL     http://localhost:5678     # optional: "Open in n8n" links

docker compose up -d               # or: npm run n8n:up (runs the setup script first)
```

- `n8n-init` imports the SMTP credential and the three workflows and publishes
  them, then n8n starts. `docker compose logs n8n-init` lists what was published.
- **n8n editor:** <http://localhost:5678>. The first visit asks you to create the
  owner account. The workflows are already published. All ports are bound to
  `127.0.0.1` on purpose (the editor can read the secrets).
- **Mailpit:** <http://localhost:8025>. Every email the workflows send lands
  here, whatever the recipient address is; nothing leaves your machine.
- Webhooks register a few seconds after n8n reports healthy.
- **Run the overdue reminders now** (instead of waiting for 09:00):
  `npm run n8n:remind`, or open *LendLoop · Overdue reminders* in the editor and
  click **Execute workflow** (the "Run now" trigger). Running it again the same
  day sends nothing new: those loans are counted as skipped. n8n does not fire
  the error workflow for manual or CLI runs, only for scheduled and webhook ones.
- After editing a workflow JSON: `npm run n8n:reimport`. Stop with
  `npm run n8n:down` (`docker compose down -v` also deletes n8n's volume).

No n8n handy? `npm run n8n:mock` starts a small stand-in webhook that verifies
signatures and logs field names. See [docs/integration.md](docs/integration.md#try-it)
for signed test requests with `npm run n8n:sign`.

### 6. Run the app

```sh
npm run dev                        # http://localhost:3000
```

Use port 3000: the email links point at `APP_URL` (default `http://localhost:3000`
in `n8n/defaults.env`).

### Demo accounts

Seeded neighbors have no Clerk account yet. A seeded row is linked to the first
Clerk user who signs in with the **same, verified** email:

| Person | Email | Role | Good for |
|---|---|---|---|
| Maya L. | `maya.l@example.com` | user | borrower with an overdue loan (L-1042), an upcoming booking and a pending request; owner of a ladder with two incoming requests |
| Rina S. | `rina.s@example.com` | user · Trusted Lender | lender of the overdue drill |
| Dimas P., Sam R., Arif H. | `dimas.p@` / `sam.r@` / `arif.h@example.com` | user | other parties |
| Ayu W. | `ayu.w@example.com` | **admin** | admin console |

In a Clerk **development** instance you don't need a real inbox: sign up with
`maya.l+clerk_test@example.com` (or `ayu.w+clerk_test@example.com`, …) and enter
the verification code **`424242`**. Convex strips the `+clerk_test` part, so the
account links to the seeded Maya (or Ayu). Any other email creates a fresh
neighbor with the role `user`.

To make someone an admin (there is deliberately no UI for it):

```sh
npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'
```

## Environment variables

**Next.js: `.env.local`** (template: `.env.example`)

| Variable | Purpose | Secret |
|---|---|---|
| `CONVEX_DEPLOYMENT` | which deployment `npx convex` targets (written by `convex dev`) | no |
| `NEXT_PUBLIC_CONVEX_URL` | Convex client URL (written by `convex dev`) | no |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Convex HTTP actions URL (written by `convex dev`; the app itself doesn't use it) | no |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend key | no (public) |
| `CLERK_SECRET_KEY` | Clerk backend key, used by `proxy.ts` | **yes** |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `…_SIGN_UP_URL` | `/sign-in`, `/sign-up` | no |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`, `…_SIGN_UP_…` | where to land after auth (`/tools`) | no |
| `NEXT_PUBLIC_APP_TIME_ZONE` | the neighborhood's "today" in the browser; must equal `APP_TIME_ZONE` | no |

**Convex deployment env** (`npx convex env set …` or the dashboard; never in a file)

| Variable | Purpose | Secret |
|---|---|---|
| `CLERK_JWT_ISSUER_DOMAIN` | Clerk Frontend API URL; Convex verifies JWTs against it | no |
| `APP_TIME_ZONE` | the neighborhood timezone (default `Asia/Jakarta`); "today", overdue, date rules | no |
| `N8N_REQUEST_WEBHOOK_URL` | n8n request-event webhook | no, but never shown in the UI |
| `N8N_WEBHOOK_SECRET` | signs Convex → n8n requests | **yes** |
| `CONVEX_INBOUND_SECRET` | verifies n8n → Convex requests | **yes** |
| `N8N_EDITOR_BASE_URL` | optional, for "Open execution in n8n" links | no |

**n8n: `n8n/.env`** (gitignored; template `n8n/.env.example`, generated by `scripts/setup-n8n-env.sh`) and `n8n/defaults.env` (committed, non-secret)

| Variable | File | Purpose | Secret |
|---|---|---|---|
| `N8N_ENCRYPTION_KEY` | `.env` | encrypts n8n's stored credentials; don't change it later | **yes** |
| `N8N_WEBHOOK_SECRET` | `.env` | verifies Convex's webhook calls (same value as in Convex) | **yes** |
| `CONVEX_INBOUND_SECRET` | `.env` | signs n8n's calls to Convex (same value as in Convex) | **yes** |
| `GENERIC_TIMEZONE`, `TZ` | `defaults.env` | schedule (09:00) and reminder `runDate`; must equal `APP_TIME_ZONE` | no |
| `CONVEX_SITE_URL` | `defaults.env` | Convex HTTP actions (`http://host.docker.internal:3211`) | no |
| `APP_URL`, `MAIL_FROM` | `defaults.env` | email links and sender | no |

Any `defaults.env` value can be overridden in `n8n/.env`. The workflow JSON reads
secrets through `$env` only; the files contain no secret values and no
credential data.

## RBAC and security decisions

| Action / data | Visitor | Member | Owner (own tool) | Admin |
|---|---|---|---|---|
| Tool name + category | ✓ (`listPublic`) | ✓ | ✓ | ✓ |
| Description, condition, availability, owner name | – | ✓ | ✓ | ✓ |
| Counterpart's email | – | only the other party of an upcoming / on-loan / overdue loan | same | never (not even in admin views) |
| Create a listing | – | ✓ | ✓ | ✓ |
| Edit / delete a listing | – | – (403) | ✓ own only | own only; **remove** any (soft, with reason) |
| Request to borrow | – | ✓ (not own tool) | – | ✓ as a member |
| Approve / decline / mark returned | – | – | ✓ own tools | own tools only; read-only on others' loans |
| Cancel / "I've returned it" | – | own requests | – | own requests |
| Loan detail | – | 404 unless a party | ✓ | ✓ read-only ribbon |
| All loans, users, automation, Trusted Lender | – | 403 | 403 | ✓ (Trusted Lender not on self) |

- **Enforced in Convex, not the UI.** Every public query and mutation starts with
  `requireViewer` or `requireAdmin` (`convex/lib/auth.ts`) and then checks
  ownership or party role against the stored loan or tool. The UI hides what a
  role can't do and disables blocked actions with the reason, but that is only
  presentation. `proxy.ts` redirects signed-out visitors as a UX gate only.
  `convex/rbac.test.ts` calls the functions as visitors, non-owners, non-parties
  and admins and expects them to be refused.
- **Identity comes from the server.** `ownerId` and `borrowerId` come from the
  verified Clerk identity, never from arguments. Dates are validated against the
  server's "today".
- **404 vs 403.** A loan you're not a party to is `NOT_FOUND`, so loan refs
  don't reveal that a loan exists. 403 (`FORBIDDEN`) is used where the page
  itself is role- or owner-gated: `/admin/*` and editing someone else's listing.
  An admin acting on another person's loan gets `FORBIDDEN`: admins view other
  people's loans but don't act on them.
- **The role never comes from the client.** `users.store` takes no arguments and
  always creates `role: "user"`. Roles live in the Convex `users` table (not in
  Clerk metadata or JWT claims) and change only through the internal
  `users:setRole`, which no client can call.
- **Account linking requires a verified email.** A seeded or pre-provisioned row
  is claimed only when the Clerk token says `email_verified`, so nobody can take
  over the admin row by signing up with an unverified address.
- **HMAC in both directions, one secret per direction.**
  `X-LendLoop-Signature: v1=hex(HMAC-SHA256(secret, "<timestamp>.<raw body>"))`
  plus `X-LendLoop-Timestamp`. The MAC covers the raw bytes. Requests outside
  **±300 s** are rejected as stale (replay window). The compare is constant-time
  (`crypto.subtle.verify` in Convex, `crypto.timingSafeEqual` in n8n). Separate
  secrets mean a leaked n8n secret can't forge Convex write-backs. Convex also
  caps inbound bodies at 16 KB, and n8n at 1 MiB.
- **Rejected signatures are only logged, not counted.** A 401 writes nothing:
  counting rejections in the database would let anyone on the internet grow our
  storage and flood the admin page. The reason (`stale`, `mismatch`, …) goes to
  the Convex function log or the n8n container log.
- **Secrets** live in the Convex deployment env and `n8n/.env` (gitignored). The
  admin Configuration card shows presence only. The webhook URL, secrets and
  payloads never reach the browser.

## Data minimization

- **Public projection.** `tools.listPublic` returns exactly `{_id, name, category}`
  of currently available tools. Other fields aren't hidden in the UI; they are
  never sent. The DTOs in `lib/domain/dto.ts` are the only shapes that leave
  Convex.
- **Availability per viewer.** Non-owners see an overdue tool as plain "On loan".
  The calendar gets booked date ranges only, with no borrower names or IDs.
- **Contact unlock.** A party sees the other party's email only while the loan is
  upcoming, on loan or overdue. Admin views never include emails; the admin users
  table has no email column.
- **To n8n (`FIELDS_SENT`):** `event, loanId (the "L-1042" ref), toolName,
  startDate, endDate, recipientRole, recipientFirstName, recipientEmail`, plus
  `idempotencyKey` and `attempt`. **Not sent:** description, condition, the
  other party's email, user IDs, Convex document IDs. n8n's *Verify signature*
  node also keeps only these fields, so an unexpected extra field never reaches
  another node. Decline reasons are presets because free text would end up in
  the payload.
- **From n8n:** keys, statuses, counts, error categories, execution IDs, node and
  workflow names. Never email addresses, message bodies or error text.
- **Logs store field names only.** A delivery row stores the *names* of the
  fields sent, not their values. The admin drawer shows those names and the
  "Not sent" note. Convex and n8n log lines carry keys, reasons and counts.
- **Retention.** n8n prunes executions (which contain the recipient email)
  after 7 days. The admin Automation page also looks back 7 days.

## Automation reliability

Full detail in [docs/integration.md](docs/integration.md).

- **Transactional outbox.** The mutation that changes a loan also inserts the
  `deliveries` row (`queued`) and schedules the send, in one transaction: no
  status change without its notification, and no notification for a change
  that rolled back.
- **Idempotency keys.** `notify:<ref>:<event>` (one email per loan event) and
  `reminder:<ref>:<runDate>` (at most one reminder per loan per day). Retries
  and admin "Retry now" reuse the key.
- **Outbound retries (Convex → n8n):** 10 s timeout, 3 attempts with 30 s then
  2 min backoff (`retrying` in between). 400/413/422 and "not configured" are
  final, since the same payload would fail again. Before every send, Convex
  checks the event still describes the loan, so a cancelled request is never
  emailed late (`superseded`, which is not counted as a failure).
- **n8n retries:** each email gets 3 attempts 5 s apart (an explicit chain, see
  the integration doc for why), and each HTTP call to Convex gets 3 tries 5 s
  apart with the same signed body.
- **Write-back dedupe:** `/n8n/deliveries` applies each `(key, attempt, status)`
  once and answers `{ok, duplicate}`. A late `failed` never overwrites `sent`.
  Reminder runs dedupe by `executionId` and errors by `(executionId, workflow)`.
  `/n8n/overdue-loans` leaves out loans already reminded that day, so a re-run
  sends nothing twice.
- **Error workflow:** both workflows name *LendLoop · Error handler*, which
  categorizes the crash (timeout, network, upstream 4xx/5xx, signature rejected,
  not configured) and reports it, signed, to `/n8n/errors`. If the crashed run
  was a single request notification, Convex marks that delivery failed.
- **Nothing waits forever:** a sweeper (every 5 min) fails deliveries that n8n
  accepted but never wrote back within 15 minutes, as `timeout`.
- **How failures surface:** admins get a red count on the Admin nav, a banner
  ("N automation failures in the last 24h"), red rows in Deliveries, Workflow
  errors, a Reminder runs tab, "Retry now" and n8n execution links. Users see one
  calm line per notification: *Sent*, *Delayed* ("we'll retry automatically"), or
  *Failed* ("LendLoop is on it"), never error codes.

## Testing

```sh
npm test            # vitest: 77 tests, convex-test in the edge runtime
npm run typecheck   # app + convex tsconfig
npm run lint
```

| Suite | Covers |
|---|---|
| `convex/rbac.test.ts` | account linking (verified email only, `+clerk_test`), `setRole` internal, owner-only edit/delete (admins too), public projection, per-viewer availability, 404 for non-parties, admin read-only, contact unlock, every `admin.*` FORBIDDEN for users, Trusted Lender, remove listing |
| `convex/loans.test.ts` | request rules (server today, 14 days, one pending, taken dates), approve auto-declines overlaps, preset decline reasons, cancel/return rules, nav counts, timeline per role |
| `convex/automation.test.ts` | overdue endpoint data + skip logic, write-back idempotency, failed-never-overrides-sent, reminder runs/errors dedupe, linking errors to deliveries, signed minimized outbound payload, backoff, final 4xx, Retry now (same key, overdue only), config presence only, stale sweeper, `failed24h`, superseded sends |
| `convex/http.test.ts` | every `/n8n/*` endpoint: 200 + idempotent, 401 (wrong / stale / missing signature, nothing written), 503, 413, 400, 404 |
| `lib/domain/domain.test.ts` | status derivation, availability, dates, idempotency keys, HMAC round-trip and rejection |

The n8n workflows were run end to end against a local Convex backend (see
[docs/integration.md](docs/integration.md#architecture)). The UI has no
automated tests yet (see [docs/production.md](docs/production.md)).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run dev:convex` | `convex dev` |
| `npm run seed` | `convex run seed:run` (add `'{"force": true}'` via `npx convex run` to reseed) |
| `npm test`, `npm run typecheck`, `npm run lint` | checks |
| `npm run n8n:up` / `n8n:down` | create `n8n/.env` if missing + `docker compose up -d` / `down` |
| `npm run n8n:reimport` | re-import and publish workflows after editing the JSON |
| `npm run n8n:remind` | run the overdue-reminder workflow now |
| `npm run n8n:sign -- <path\|url> [json] [flags]` | send a signed (or deliberately bad) request; see `scripts/sign-and-send.mjs` |
| `npm run n8n:mock` | stand-in n8n webhook that verifies signatures |
| `sh scripts/setup-n8n-env.sh` | write `n8n/.env` with random secrets (never overwrites) |

## Known limitations and trade-offs

- **One neighborhood, one timezone.** "Today" is `APP_TIME_ZONE` for everyone,
  and n8n's schedule must use the same zone.
- **No pagination.** Lists and admin tables read whole tables (`collect()`).
  That's fine at seed scale but not for a large neighborhood.
- **Replay window.** A captured request event replayed within 5 minutes
  re-sends the same email. It can't change the content or create a record; no
  nonce store is kept.
- **A reminder whose write-back never reaches Convex** (Convex down longer than
  the retries) has no delivery row. The run counts it as failed, but a same-day
  re-run would send it again.
- **n8n runs Code nodes in its internal task runner with `$env` access.** That is
  fine locally, but anyone with editor access can read the secrets. n8n uses
  SQLite here.
- **Removed listings** return 404 on their detail page for everyone, including
  the owner; owners and admins see them in My listings and Admin → Listings.
- **Demo-only account linking.** Linking seeded rows by verified email, and
  stripping `+clerk_test`, exist for the demo; production would drop both.
- **No end-to-end browser tests**, rate limiting or audit log yet. See
  [docs/production.md](docs/production.md).
