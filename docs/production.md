# What I'd change to run this in production

The local setup favors "one command, no accounts" over durability. These are
the changes I'd make before real neighbors use it, roughly in priority order.

## Infrastructure

- **Convex:** a managed production deployment (`npx convex deploy` from CI),
  separate from dev and preview deployments, with its own env vars. Turn on
  scheduled backups / snapshot exports and practice a restore once.
- **n8n:** queue mode with **Postgres** (instead of SQLite) and **Redis**, one
  main instance plus workers, and a dedicated webhook processor. Run Code nodes
  in **external task runners** (`n8nio/runners` sidecar) instead of the
  deprecated internal mode, and back up the Postgres database and the
  `N8N_ENCRYPTION_KEY` together.
- **Network:** put the n8n editor behind SSO/VPN. Expose only
  `/webhook/lendloop/*` publicly, behind TLS. Remove `N8N_SECURE_COOKIE=false`.
- **Clerk:** a production instance on our own domain, with the Convex JWT
  template recreated there and `CLERK_JWT_ISSUER_DOMAIN` pointing at it. Add
  bot protection and MFA for admins.
- **Remove the demo shortcuts:** linking seeded rows by verified email, stripping
  `+clerk_test` in `normalizeEmail`, and the seed itself. Production users are
  created only through `users.store`; admins are promoted by a reviewed
  `users:setRole` run.

## Secrets

- Keep secrets in a secrets manager (Vault, AWS/GCP Secret Manager, Doppler) that
  syncs to the Convex env and n8n, not in a hand-copied `.env`.
- **Rotation with a dual-secret window.** Add a key id to the signature header
  (`v1;kid=2026-11=…`). Receivers accept the current *and* the previous secret
  for a short overlap; senders switch to the new one; then the old one is
  removed. Do this per direction, on a schedule and on any suspected leak.
- Stop giving Code nodes `$env`: move the HMAC secrets into n8n credentials
  (Crypto node / custom credential) and turn `N8N_BLOCK_ENV_ACCESS_IN_NODE` back
  on, so editor access no longer means secret access.

## Email and notifications

- A real provider (Postmark, SES, Resend) with **SPF, DKIM and DMARC** on our
  domain, bounce and complaint webhooks fed back into Convex, and suppression
  of hard-bounced addresses.
- **Per-user notification preferences** (which events, email vs digest), an
  unsubscribe link in every email, and quiet hours for reminders.
- An in-app notification center, so a delivery failure never means a user missed
  something.

## Abuse protection

- **Rate limiting** on mutations (e.g. `@convex-dev/rate-limiter`: requests per
  user per hour, listings per day) and on the `/n8n/*` HTTP endpoints (per IP,
  before signature verification), plus a WAF / rate limit on the public n8n
  webhook.
- A nonce or recently-seen-signature cache to close the 5-minute replay window
  for request events, if re-sent emails become a concern.
- Content moderation hooks for listing names and descriptions; a report button.

## Observability

- **Alerting on failed deliveries**, not just the admin badge: page or Slack when
  `failed24h` crosses a threshold, a reminder run fails or is missing for the
  day, or the stale-delivery sweeper fires. Use a heartbeat check for the daily
  run.
- Ship Convex logs (log streams) and n8n logs to one place (Datadog, Axiom,
  Grafana) with the idempotency key as the correlation id. Add Sentry for the
  Next.js app.
- Uptime checks on the Convex HTTP actions and the n8n webhook.

## Data and compliance

- **Audit log for admin actions** (remove listing, Trusted Lender changes, Retry
  now, role changes): who, what, when, and the reason, append-only and visible to
  other admins.
- **GDPR-style retention and deletion:** a Clerk `user.deleted` webhook that
  anonymizes the user's rows (name → "Former neighbor", email cleared), TTL crons
  for `deliveries`, `deliveryAttempts` and `workflowErrors`, and a data export for
  users. Document the retention periods in a privacy notice.
- **Multi-timezone neighborhoods:** store a timezone per neighborhood (or per
  loan), derive "today" from it, and schedule reminders per zone instead of one
  global `APP_TIME_ZONE` / 09:00 run.

## Scale

- **Pagination** for every list (`.paginate()` with cursors) and admin table,
  server-side search and filtering with indexes, and denormalized counters
  (pending count, loans completed) instead of reading whole tables.
- Batch the overdue endpoint (cursor-based pages) so a large neighborhood
  doesn't exceed Convex's per-call read limits.

## Quality gates

- **E2E tests (Playwright) in CI** covering sign-in with Clerk test users,
  request → approve → return, and the n8n round trip against the
  docker-compose stack and Mailpit's API.
- CI runs typecheck, lint, unit tests and `next build` on every PR, plus a
  check that exported workflow JSON contains no credential data.
- **Security headers:** a strict **CSP** (Clerk, Convex and font origins only),
  HSTS, `frame-ancestors 'none'`, `Referrer-Policy`, set in `next.config.ts`.
- Dependency and image scanning (npm audit / Renovate, pinned n8n image digests).
