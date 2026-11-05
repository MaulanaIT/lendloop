# LendLoop × n8n integration

LendLoop uses n8n for two jobs: **request notifications** (an email when a borrow
request is created or changes status) and **daily overdue reminders**. Convex
holds the state and decides what to send. n8n does the delivery and reports back.
Every request in either direction is HMAC-signed, and every write-back is
idempotent.

| Piece | Where |
|---|---|
| Contract (types, keys, statuses, error categories) | `lib/domain/automation.ts`, `lib/domain/dto.ts` ("n8n wire types") |
| Signing (both directions) | `lib/domain/signing.ts` |
| Convex HTTP endpoints | `convex/http.ts` (`/n8n/*`) |
| Workflows (exported JSON) | `n8n/workflows/*.json` |
| Local stack | `docker-compose.yml` (n8n 2.46.6 + Mailpit v1.33.0), `n8n/init/import.sh` |
| Helpers | `scripts/sign-and-send.mjs`, `scripts/mock-n8n-webhook.mjs`, `scripts/setup-n8n-env.sh` |

## Architecture

```
                      ┌──────────────────────────── Convex ─────────────────────────────┐
  Next.js UI ──────▶  │ mutations (loans.request/approve/…)                              │
  (Clerk auth)        │   └─ insert delivery {status: queued, idempotencyKey}            │
                      │      └─ schedule action ─── POST signed (N8N_WEBHOOK_SECRET) ────┼──┐
                      │                                                                  │  │
                      │ HTTP actions (verify CONVEX_INBOUND_SECRET)                      │  │
                      │   POST /n8n/overdue-loans  ◀──────────────────────────────────┐  │  │
                      │   POST /n8n/deliveries     ◀───────────────────────────────┐  │  │  │
                      │   POST /n8n/reminder-runs  ◀────────────────────────────┐  │  │  │  │
                      │   POST /n8n/errors         ◀─────────────────────────┐  │  │  │  │  │
                      └──────────────────────────────────────────────────────┼──┼──┼──┼──┼──┘
                                                                             │  │  │  │  │
                      ┌─────────────────────────── n8n ──────────────────────┼──┼──┼──┼──┼──┐
                      │ LendLoop · Request notifications                     │  │  │  │  │  │
                      │   Webhook /webhook/lendloop/request-events ◀─────────┼──┼──┼──┼──┘  │
                      │   verify HMAC → 401 | 400 | 202 → email → write-back ┼──┼──┼──┘     │
                      │ LendLoop · Overdue reminders (daily 09:00)           │  │  │        │
                      │   signed fetch ──────────────────────────────────────┼──┼──┼──────▶ │
                      │   email per loan → write-back per loan ──────────────┼──┼──┘        │
                      │   run summary ───────────────────────────────────────┼──┘           │
                      │ LendLoop · Error handler (errorWorkflow of both)     │              │
                      │   categorize → report ───────────────────────────────┘              │
                      └──────────────────────────────┬──────────────────────────────────────┘
                                                     │ SMTP :1025
                                                     ▼
                                          Mailpit (UI :8025, local email sink)
```

Convex and Next.js run on the host. n8n runs in Docker and reaches the Convex
HTTP actions at `http://host.docker.internal:3211` (`CONVEX_SITE_URL`). The local
Convex backend reaches n8n at `http://localhost:5678`. Both directions were
checked end to end against a local `npx convex dev` backend: request event →
202 → email in Mailpit → `sent` write-back, the daily run (found 2 / sent 1 /
skipped 1, then a same-day re-run found 2 / sent 0 / skipped 2), 401 on a bad
signature each way, and a failed write-back reported through the error workflow.

## Flow 1: request notifications

Event to recipient (set where each mutation calls `enqueueNotification`, `convex/lib/notify.ts`):

| Event | Recipient | Email subject |
|---|---|---|
| `requested` | owner | New borrow request for {tool} |
| `approved` | borrower | Your request for {tool} was approved |
| `declined` | borrower | Your request for {tool} was declined |
| `cancelled` | owner, or borrower if the owner side cancelled | Borrow request for {tool} was cancelled / Your loan of {tool} was cancelled |
| `return_reported` | owner | {tool} was reported returned |
| `returned` | borrower | Thanks for returning {tool} |
| `overdue_reminder` | borrower | Reminder: {tool} was due back {date} |

Every email greets `recipientFirstName` and links to `APP_URL/loans/<loanId>`.

1. A Convex mutation changes the loan and inserts a `deliveries` row
   (`status: queued`, `idempotencyKey: notify:L-1057:requested`, `attempts: 0`) in
   the same transaction. It then schedules an action. The first send is attempt 1
   (`attempt = attempts + 1` in the payload).
2. The action builds the `NotificationPayload` (minimized fields only), signs the
   exact JSON string with `N8N_WEBHOOK_SECRET`, and POSTs it to
   `N8N_REQUEST_WEBHOOK_URL`. Before every send (first try, automatic retry or
   admin "Retry now") Convex checks that the event still describes the loan
   (`resendCheck` in `lib/domain/automation.ts`): `requested` only while the
   loan is pending, `approved` only while it is approved, `return_reported`
   only until it is marked returned, and a reminder only for today while the
   loan is still overdue. Otherwise nothing is sent and the delivery ends
   `failed` with category `superseded`. That is not a failure: it is left out of
   `failed24h`, can't be retried, and users only see the newer event's line.
3. In n8n, **Request event webhook** has *Raw Body* enabled and responds through a
   Respond to Webhook node. **Verify signature** recomputes the HMAC over the raw
   bytes and compares it with `crypto.timingSafeEqual`.
   - Invalid, missing, stale or malformed signature: **401** `{"error":"invalid_signature"}`.
     Nothing else runs. The reason (`mismatch`, `stale`, …) goes to the n8n log only.
   - Signed but missing a required field: **400** `{"error":"invalid_payload"}`.
   - Valid: **202** `{"accepted":true,"executionId":"<n8n execution id>"}`.
     Convex sets the delivery to `accepted` and stores the execution ID (also on
     an `accepted` attempt row, which is how it later links error reports).

   How Convex reacts to each answer (`convex/notifications.ts`):

   | n8n answer | Delivery | Error category |
   |---|---|---|
   | 2xx | `accepted` (unless a write-back already settled it) | – |
   | 401 / 403 | `retrying`, then `failed` after 3 attempts | `signature_rejected` |
   | 400 / 413 / 422 | `failed` at once: the same payload would be rejected again | `upstream_4xx` |
   | other 4xx (404 = workflow not published yet) | `retrying` → `failed` | `upstream_4xx` |
   | 5xx | `retrying` → `failed` | `upstream_5xx` |
   | no answer in 10 s / connection error | `retrying` → `failed` | `timeout` / `network` |
4. **Build message** composes the email from the payload fields only.
   **Send email** (SMTP credential *Mailpit SMTP (local)*) makes up to 3 attempts,
   5 s apart (see [Retries](#retries)).
5. On success, **Sign write-back: sent** signs
   `{idempotencyKey, status:"sent", attempt, executionId, channel:"email"}`.
   If all 3 attempts fail, **Sign write-back: failed** signs the same body with
   `status:"failed"` and `errorCategory:"delivery_failed"`.
   **Write back delivery** POSTs the exact signed string to
   `CONVEX_SITE_URL/n8n/deliveries`, with `X-Idempotency-Key` set. It retries 3× with
   5 s between tries and reuses the same signature (well inside the 300 s window).
6. Convex applies the write-back once per `(idempotencyKey, attempt, status)`.
   It answers `{ok, duplicate}`, so a replayed write-back changes nothing.
   `sent` is final. `failed` is final too, because n8n only writes it after its
   own 3 SMTP attempts: the delivery shows as failed (admin badge, banner) and
   an admin can "Retry now".

## Flow 2: overdue reminders

1. **Daily 09:00** (Schedule Trigger, workflow timezone = `GENERIC_TIMEZONE`,
   default `Asia/Jakarta`) or **Run now (manual test)** starts the run.
2. **Sign overdue-loans request** computes `runDate` as today's date in
   `GENERIC_TIMEZONE` and signs `{"runDate","executionId"}`.
3. **Fetch overdue loans** POSTs to `/n8n/overdue-loans` and retries 3×. Convex
   returns `OverdueLoansResponse` = `{runDate, loans: OverdueLoanForN8n[], skipped: number}`.
   Overdue is derived (`endDate < runDate` and still on loan), never stored.
   A loan whose `reminder:<ref>:<runDate>` is already `sent`, or in flight
   through an admin "Retry now", is left out and only counted in `skipped`.
   A loan whose reminder for that date `failed` earlier is offered again with
   `attempt` = previous attempts + 1; every other loan has `attempt: 1`.
4. **Any overdue loans?** If there are none, the run goes straight to the summary,
   so an empty day is still recorded.
5. **Prepare reminders** creates one item per loan. **Send reminder** makes up to
   3 attempts per loan. **Collect outcomes** merges the successes from each attempt
   with the final failures.
6. **Build write-backs** produces one `/n8n/deliveries` body per loan:
   `{idempotencyKey: "reminder:L-1042:2026-11-05", status: sent|failed, attempt, executionId, channel:"email"}`.
   **Write back reminder** (a Code node) signs and POSTs each body on its own,
   with up to 3 tries per loan, 5 s apart, signing every try afresh over the same
   body. Only no answer, 429 and 5xx are retried; another 4xx would be rejected
   again. The response's `duplicate` flag is kept. A write-back that still fails
   is counted as `failed`, so the run summary is still posted.
7. **Summarize run** posts `/n8n/reminder-runs`:
   `{executionId, runDate, found, sent, skipped, duplicates, failed, durationMs}`,
   where `found = loans.length + skipped` (every overdue loan for the day) and
   `failed` counts both SMTP failures and write-backs that never reached Convex.
   Convex stores one row per `executionId` (a retried post answers
   `{duplicate:true}`) and derives the status: `completed` (no failures),
   `failed` (failures and nothing sent) or `completed_with_failures`.

Loans in the response and email copy contain only the fields listed in
`OverdueLoanForN8n`.

## Flow 3: error workflow

Both workflows set `settings.errorWorkflow = lendloopErrorHdl` and
`saveDataErrorExecution = all`. When an execution crashes (for example, Convex is
unreachable during a write-back, or a node throws), **LendLoop · Error handler**
runs:

1. **On workflow error** (Error Trigger) receives the failed execution.
2. **Categorize error** maps it to an `ErrorCategory`:

   | Signal | Category |
   |---|---|
   | `CONVEX_INBOUND_SECRET is not set` (n8n side), or Convex's 503 `{"error":"not_configured"}` | `not_configured` |
   | HTTP 401 from Convex (it answers 401 only for a rejected HMAC) | `signature_rejected` |
   | HTTP 5xx | `upstream_5xx` |
   | other HTTP 4xx | `upstream_4xx` |
   | timeout / ETIMEDOUT / ECONNABORTED | `timeout` |
   | ECONNREFUSED / DNS / reset / "refused the connection" | `network` |
   | anything else | `delivery_failed` |

   Error messages, item data and stack traces are used here only to classify the
   error, then dropped.
3. **Report to Convex** posts a signed
   `{executionId, workflow, node, errorCategory}` to `/n8n/errors` (retry 3×). It
   also logs one line, for example:
   `[lendloop] workflow error workflow="LendLoop · Request notifications" node="Write back delivery" category=network execution=28`.

The error trigger cannot see the failed run's items, so it cannot send the
`idempotencyKey`. Convex links the report through `executionId` instead: when
exactly one delivery carries that ID and Convex recorded it from the webhook's
202 (an `accepted` attempt), the execution was a request notification for that
delivery. Convex stores the key on the error row and marks the delivery
`failed` with the reported category, unless it is already `sent`, so the
failure is counted once. A reminder run handles several loans under one
execution ID, so its crash is never linked to a delivery. It stays a separate
workflow error and counts in `failed24h` by itself.

Error workflows fire for webhook and schedule executions. They do **not** fire
for editor ("manual") runs, and in practice not for `n8n execute` either: in
our test a CLI run that failed at *Fetch overdue loans* exited with status
`error` and no report reached Convex.

## Convex endpoint responses

Every `/n8n/*` endpoint checks, in order: secret configured → body size →
signature → JSON → fields. Unknown JSON fields are ignored and never stored.

| Status | Body | When | n8n's error category |
|---|---|---|---|
| 200 | `{ok, duplicate}` (`/n8n/overdue-loans`: `OverdueLoansResponse`) | applied, or recognised as a duplicate | – |
| 400 | `{"error":"invalid_json"}` / `{"error":"invalid_body","field":"…"}` | signed, but malformed | `upstream_4xx` |
| 401 | `{"error":"invalid_signature"}` | **only** a missing, stale, malformed or wrong signature; nothing is written | `signature_rejected` |
| 404 | `{"error":"unknown_key" \| "unknown_loan" \| "unknown_delivery"}` | `/n8n/deliveries` for a key Convex never issued | `upstream_4xx` |
| 413 | `{"error":"payload_too_large"}` | body over 16 KB | `upstream_4xx` |
| 503 | `{"error":"not_configured"}` | `CONVEX_INBOUND_SECRET` unset | `not_configured` |

## How failures surface in the app

- **Delivery rows**: queued → accepted → sent, or retrying → failed. The rows are
  shown in the admin Automation page (Deliveries tab, failed rows have a red left
  border) and, by role, in each loan's timeline.
- **Admin nav badge and banner** come from `failed24h`: failures in the last 24 h
  that were not followed by a successful retry. That is failed deliveries
  (except `superseded`), workflow errors not linked to a delivery, and reminder
  run failures that never became a delivery row (a write-back that didn't reach
  Convex). The page only says "All automations healthy" when the last run had
  no failures either.
- **Timeouts**: a delivery still `accepted` 15 minutes after n8n took it (no
  write-back and no error report, e.g. n8n restarted mid-run), or still
  `queued`/`retrying` with no send due, is set to `failed` with category
  `timeout` by a sweeper (`notifications.expireStale`, every 5 minutes in
  `convex/crons.ts`). It then counts in `failed24h`, users see the failure line,
  and an admin can "Retry now". A write-back that arrives later still wins.
- **Reminder runs tab** lists each run with found / sent / skipped / duplicates /
  failed / duration.
- **"Open execution in n8n"** (delivery drawer) links to
  `N8N_EDITOR_BASE_URL/workflow/<workflowId>/executions/<executionId>`, the same
  URL n8n itself builds for an execution. Workflow IDs are `lendloopReqNotif`,
  `lendloopOverdueR` and `lendloopErrorHdl` (`N8N_WORKFLOW_IDS` in
  `lib/domain/automation.ts`). Convex picks the workflow per execution
  (`DeliveryDTO.executionWorkflowId`, `attemptHistory[].workflowId`). A
  notification always ran in `lendloopReqNotif`. For a reminder, an execution
  ID that came back in a 202 ("Retry now" goes through the request webhook)
  also belongs to `lendloopReqNotif`; any other reminder execution belongs to
  `lendloopOverdueR`.
- **Workflow errors** from `/n8n/errors` appear on the Automation page with
  workflow, node, category and execution ID.
- **Users** see one line per notification with its latest state: *Sent*,
  *Delayed* ("Notification delayed — we'll retry automatically. Your request is
  still visible to {owner} in LendLoop."), or *Failed* ("LendLoop is on it").
  Users never see technical details.
- **Admin "Retry now"** on a failed delivery reuses the same idempotency key, so a
  late write-back from the original attempt cannot create a second record. It is
  offered only while `resendCheck` passes: a reminder from an earlier day is
  replaced by today's run ("at most one reminder per loan per day").

## Signing spec

The same scheme is used in both directions (`lib/domain/signing.ts`):

```
X-LendLoop-Timestamp: <unix seconds>
X-LendLoop-Signature: v1=<hex( HMAC_SHA256( secret, "<timestamp>.<rawBody>" ) )>
X-Idempotency-Key:    <idempotencyKey>          (informational; the body is authoritative)
```

| Direction | Secret | Verified by |
|---|---|---|
| Convex → n8n (request events) | `N8N_WEBHOOK_SECRET` | n8n *Verify signature* Code node |
| n8n → Convex (fetch, write-backs, runs, errors) | `CONVEX_INBOUND_SECRET` | `convex/http.ts` via `verifySignature` |

Rules:

- The MAC covers the **raw body bytes**. n8n signs `JSON.stringify(body)` once and
  the HTTP Request node sends that exact string as a raw `application/json` body.
  The webhook verifies `binary.data` (Raw Body), not the parsed JSON, because
  re-serializing could reorder keys or change whitespace.
- The timestamp must be within **±300 s** of the receiver's clock (`stale` otherwise).
- The signature must match `^v1=[0-9a-f]{64}$`. The comparison is constant-time:
  `crypto.timingSafeEqual` in n8n, `crypto.subtle.verify` in Convex.
- Using a separate secret for each direction means a leaked n8n secret cannot be
  used to forge Convex write-backs, and the other way round.

`scripts/sign-and-send.mjs` and the n8n Code nodes use `node:crypto`, while
`lib/domain/signing.ts` uses Web Crypto. Both were checked to produce identical
signatures for the same input.

### Replay window

A captured request can be replayed for at most 5 minutes. Inside that window a
replay cannot create a duplicate record, but it is not entirely without effect:

- write-backs are idempotent (next section);
- `/n8n/overdue-loans` is read-only;
- a replayed request event **does** re-send that same email: n8n keeps no record
  of the keys it has handled. The content is fixed by the signature (the
  attacker can't change recipient or text). Convex will not re-schedule a
  delivery that is already `sent`.

No nonce store is kept, which avoids a database write per inbound request.

## Idempotency and duplicates

| Key | Format | Meaning |
|---|---|---|
| Notification | `notify:<loanRef>:<event>`, e.g. `notify:L-1057:requested` | one email per loan event |
| Reminder | `reminder:<loanRef>:<runDate>`, e.g. `reminder:L-1042:2026-11-05` | at most one reminder per loan per day |

- Convex creates the key when the delivery row is inserted. Retries, including the
  admin "Retry now", reuse the key and bump `attempt`.
- `/n8n/deliveries` looks up the delivery by key. Applying the same
  `(attempt, status)` twice returns `{ok:true, duplicate:true}` and only increments
  `duplicatesIgnored`, shown to admins as "Duplicate write-back ignored". A late
  `failed` never overwrites `sent`.
- `/n8n/reminder-runs` is keyed by `executionId`: the first post creates the
  row, and a retried post (the same signed body) answers `{ok:true, duplicate:true}`.
- `/n8n/errors` is keyed by `(executionId, workflow)` and also answers `{ok, duplicate}`.
- The overdue endpoint leaves out loans whose reminder for `runDate` is
  already `sent` or in flight. Re-running the workflow the same day therefore
  sends no second email, and those loans are counted in `skipped`. Verified
  live: run 1 = found 2 / sent 1 / skipped 1, run 2 = found 2 / sent 0 / skipped 2.
- n8n HTTP retries resend the identical body (and so the same idempotency key),
  so retries are naturally deduplicated.

## Retries

| Layer | Policy |
|---|---|
| Convex → n8n webhook | 3 attempts (`MAX_ATTEMPTS`), backoff **30 s, then 2 min** (`RETRY_BACKOFF_MS`). Status `retrying` between attempts, `failed` after the last. Each attempt uses the same idempotency key. A 400/413/422 from n8n is not retried. |
| n8n email send | Up to 3 attempts, 5 s apart, built as an explicit chain: Send email → Wait 5s → attempt 2 → Wait 5s → attempt 3. |
| n8n → Convex HTTP (fetch, request write-back, run summary, error report) | Node-level *Retry On Fail*: 3 tries, 5 s apart, same signed body. Each of these nodes sends one item. |
| n8n → Convex reminder write-backs | Per loan, inside the **Write back reminder** Code node: 3 tries, 5 s apart, each try signed afresh over the same body. Only no answer / 429 / 5xx are retried. |
| Stuck deliveries | `accepted` for 15 min, or `queued`/`retrying` with no send due, become `failed · timeout` (sweeper every 5 min). |
| Crash anywhere | Error workflow reports the category to `/n8n/errors`. Admins can "Retry now" a failed delivery. |

**Why the email retries are an explicit chain:** n8n's *Retry On Fail* re-runs a
node that **throws**, or whose **first** output item on its main output carries
`json.error` (n8n 2.46.6 checks only `data[0][0]`). With
`onError = continueErrorOutput` (needed for the failure branch), the Send Email
node routes each SMTP error to its error output, so the main output never
carries the error and *Retry On Fail* would never fire. The same first-item rule
is why the reminder write-backs retry inside a Code node: with several loans in
one HTTP Request node, a failure on any item but the first was never retried,
and a failure on the first re-posted every write-back. This was verified
against n8n 2.46.6: with Mailpit stopped, the chain made three attempts. When
Mailpit came back in time, a later attempt succeeded and wrote back `sent`.

## Data minimization

Fields sent to n8n (`FIELDS_SENT`): `event, loanId (the human ref "L-1042"),
toolName, startDate, endDate, recipientRole, recipientFirstName, recipientEmail`,
plus `idempotencyKey` and `attempt` as delivery metadata.

**Not sent:** tool description, condition, the other party's email, any user IDs
or Convex document IDs. The webhook's *Verify signature* node also keeps only the
whitelisted fields, so an unexpected extra field is dropped before it reaches any
other node.

What n8n sends back to Convex: keys, statuses, counts, categories, the execution
ID, and node/workflow names. It never sends email addresses, message bodies or
error text. The admin UI shows field **names** only, never payloads, values,
signatures, secrets, webhook URLs or stack traces.

n8n stores executions, including the recipient email, for **7 days**
(`EXECUTIONS_DATA_MAX_AGE=168`, the same window as the Automation page), and at
most 2000 of them (`EXECUTIONS_DATA_PRUNE_MAX_COUNT`). Code-node logs
(`CODE_ENABLE_STDOUT`) print keys, reasons and counts only.

## Secrets and configuration

| Variable | Where | Secret? | Notes |
|---|---|---|---|
| `N8N_WEBHOOK_SECRET` | Convex env **and** `n8n/.env` | yes | must be equal on both sides |
| `CONVEX_INBOUND_SECRET` | Convex env **and** `n8n/.env` | yes | must be equal on both sides |
| `N8N_REQUEST_WEBHOOK_URL` | Convex env | no, but never shown in the UI | `http://localhost:5678/webhook/lendloop/request-events` |
| `N8N_EDITOR_BASE_URL` | Convex env | no | `http://localhost:5678`, for "Open execution in n8n" links |
| `APP_TIME_ZONE` | Convex env | no | must equal `GENERIC_TIMEZONE` |
| `N8N_ENCRYPTION_KEY` | `n8n/.env` only | yes | encrypts n8n's stored credentials; never rotate casually |
| `GENERIC_TIMEZONE`, `TZ` | `n8n/defaults.env` (override in `n8n/.env`) | no | schedule and `runDate` |
| `CONVEX_SITE_URL` | `n8n/defaults.env` | no | `http://host.docker.internal:3211` |
| `APP_URL`, `MAIL_FROM` | `n8n/defaults.env` | no | email links and sender |
| Clerk keys, `NEXT_PUBLIC_*` | `.env.local` (Next.js) | publishable/secret | unrelated to n8n |

- Convex secrets are set with `npx convex env set …`. The admin Configuration card
  shows only whether each one is present.
- `n8n/.env` is gitignored. `n8n/.env.example` has placeholders and
  `openssl rand -hex 32` hints. `scripts/setup-n8n-env.sh` generates one.
- Workflow JSON contains no secret values and no credential data. Code nodes read
  secrets from `$env`, and the SMTP credential is referenced by id/name only. The
  only credential file in the repo, `n8n/credentials/mailpit-smtp.json`, points at
  the local Mailpit (no user, no password). It is imported and encrypted with
  `N8N_ENCRYPTION_KEY`. For a real SMTP server, create the credential in the n8n UI
  instead of committing it.
- n8n 2.x blocks `$env` in Code nodes by default. Compose sets
  `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` and `NODE_FUNCTION_ALLOW_BUILTIN=crypto`.
  The trade-off: anyone who can edit workflows in this n8n instance can read its
  environment, so editor access must be limited to the people who already hold
  these secrets.

## Why rejected signatures are only logged

An unauthenticated request must not cause a write in Convex. If rejections were
counted in Convex (or turned into an n8n write-back), anyone on the internet could
grow our storage and fill the admin Automation page with noise. Both sides
therefore log a one-line rejection with the reason (`missing_headers`, `stale`,
`malformed`, `mismatch`) and return 401. Convex logs it in its function logs and
n8n in its container log. n8n itself still saves the rejected webhook execution
(headers and raw body) like any other. That storage is bounded:
`N8N_PAYLOAD_SIZE_MAX=1` (MiB) caps each request, and executions are pruned after
7 days or beyond 2000. The admin Configuration card says: "Inbound requests
require a valid HMAC signature (rejected requests are logged in Convex logs)."

## Local setup

```sh
sh scripts/setup-n8n-env.sh                 # once: n8n/.env with random secrets
npx convex env set N8N_WEBHOOK_SECRET    "$(grep ^N8N_WEBHOOK_SECRET= n8n/.env | cut -d= -f2)"
npx convex env set CONVEX_INBOUND_SECRET "$(grep ^CONVEX_INBOUND_SECRET= n8n/.env | cut -d= -f2)"
npx convex env set N8N_REQUEST_WEBHOOK_URL http://localhost:5678/webhook/lendloop/request-events
npx convex env set N8N_EDITOR_BASE_URL     http://localhost:5678
npx convex env set APP_TIME_ZONE           Asia/Jakarta

docker compose up -d                         # n8n-init imports + publishes, then n8n starts
docker compose logs n8n-init                 # shows the imported and published workflows
```

- n8n editor: <http://localhost:5678>. On first visit n8n asks you to create the
  owner account. The imported workflows are already published. All ports are
  bound to `127.0.0.1`: whoever opens the editor first becomes owner and can
  read `$env` (the secrets), so it must never be reachable from the LAN.
- Mailpit: <http://localhost:8025>.
- Webhooks register a few seconds after `/healthz` turns healthy.

After editing a workflow file, re-import and restart (idempotent):

```sh
docker compose run --rm n8n-init && docker compose restart n8n
```

The same steps as npm scripts: `npm run n8n:up`, `n8n:down`, `n8n:reimport`,
`n8n:remind` (the reminder run below), `n8n:sign -- <path|url> [json] [flags]`, `n8n:mock`.

Stop with `docker compose down`. Add `-v` to also delete n8n's database volume.

### Try it

```sh
# Convex → n8n: valid (202 + email in Mailpit) vs tampered (401)
node --env-file=n8n/.env scripts/sign-and-send.mjs http://localhost:5678/webhook/lendloop/request-events \
  --secret-env N8N_WEBHOOK_SECRET --sample requested
node --env-file=n8n/.env scripts/sign-and-send.mjs http://localhost:5678/webhook/lendloop/request-events \
  --secret-env N8N_WEBHOOK_SECRET --sample requested --bad-signature      # or --stale / --tamper / --no-signature

# n8n → Convex: signed vs unsigned call to the overdue endpoint
node --env-file=n8n/.env scripts/sign-and-send.mjs /n8n/overdue-loans '{"runDate":"2026-11-05"}'
node --env-file=n8n/.env scripts/sign-and-send.mjs /n8n/overdue-loans '{}' --stale

# Reminder run on demand (manual trigger; error workflow is not fired for CLI runs)
docker compose exec -e N8N_RUNNERS_BROKER_PORT=5690 n8n n8n execute --id lendloopOverdueR

# No n8n at all: stand-in webhook that verifies signatures and logs field names
node --env-file=n8n/.env scripts/mock-n8n-webhook.mjs
```

`N8N_RUNNERS_BROKER_PORT` is overridden for `n8n execute` because the running
server already uses the default task-broker port inside the container.

## Known limitations

- n8n runs its JS task runner in **internal** mode, which n8n 2.x has deprecated
  in favour of an external `n8nio/runners` sidecar. Internal mode is fine for local
  development. In production, run external runners: the builtin allowlist then
  moves to the launcher config, and env access can be narrowed there.
- n8n uses SQLite in the named volume. Production would use Postgres and queue mode.
- `attempt` in reminder write-backs is the attempt number Convex handed out in
  `/n8n/overdue-loans`. n8n's own SMTP attempts are not reported separately. A
  reminder that fails all 3 SMTP attempts is written back as `failed`. It can
  be retried from the admin page, or the next run that day offers it again.
- If a reminder email is sent but its write-back never reaches Convex (Convex
  down for longer than the 3 tries for that loan), Convex has no delivery row for
  it. The run counts it as `failed` (and so does `failed24h` once the run summary
  lands); if Convex is still down, the run summary fails too and the error
  workflow reports the crash. A re-run the same day would send that reminder
  again. This was verified live: the emails went out, there was no delivery
  row, and a workflow error for *Post run summary* was recorded.
