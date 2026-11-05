#!/usr/bin/env node
// Signs a JSON body exactly like lib/domain/signing.ts and POSTs it.
// Node >= 20, no dependencies.
//
//   X-LendLoop-Timestamp: <unix seconds>
//   X-LendLoop-Signature: v1=<hex(HMAC_SHA256(secret, `${timestamp}.${rawBody}`))>
//
// Usage:
//   node --env-file=n8n/.env scripts/sign-and-send.mjs <path|url> [json] [flags]
//
// Examples:
//   # n8n → Convex (default secret CONVEX_INBOUND_SECRET, base CONVEX_SITE_URL or http://127.0.0.1:3211)
//   node --env-file=n8n/.env scripts/sign-and-send.mjs /n8n/overdue-loans '{"runDate":"2026-11-05"}'
//   node --env-file=n8n/.env scripts/sign-and-send.mjs /n8n/overdue-loans '{}' --bad-signature   # → 401
//   node --env-file=n8n/.env scripts/sign-and-send.mjs /n8n/overdue-loans '{}' --stale           # → 401
//
//   # Convex → n8n: fire a sample request event at the n8n webhook
//   node --env-file=n8n/.env scripts/sign-and-send.mjs \
//     http://localhost:5678/webhook/lendloop/request-events --sample requested --secret-env N8N_WEBHOOK_SECRET
//
// Flags:
//   --secret-env NAME   env var holding the secret (default CONVEX_INBOUND_SECRET)
//   --base URL          base URL for relative paths (default $CONVEX_SITE_URL, else http://127.0.0.1:3211)
//   --sample EVENT      send a sample NotificationPayload for EVENT instead of [json]
//   --to EMAIL          recipient for --sample (default maya@example.test)
//   --bad-signature     sign with a wrong secret (expect 401)
//   --stale             use a timestamp 10 minutes in the past (expect 401)
//   --no-signature      omit both signature headers (expect 401)
//   --tamper            sign the body, then change one byte before sending (expect 401)

import { createHmac } from "node:crypto";

const EVENTS = ["requested", "approved", "declined", "cancelled", "return_reported", "returned", "overdue_reminder"];

function parseArgs(argv) {
  const opts = { flags: new Set(), positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--secret-env", "--base", "--sample", "--to"].includes(a)) opts[a.slice(2)] = argv[++i];
    else if (a.startsWith("--")) opts.flags.add(a.slice(2));
    else opts.positional.push(a);
  }
  return opts;
}

function usage(msg) {
  if (msg) console.error(`error: ${msg}\n`);
  console.error("usage: node --env-file=n8n/.env scripts/sign-and-send.mjs <path|url> [json] [--secret-env NAME] [--base URL]");
  console.error("       [--sample EVENT] [--to EMAIL] [--bad-signature|--stale|--no-signature|--tamper]");
  process.exit(2);
}

function samplePayload(event, to) {
  if (!EVENTS.includes(event)) usage(`--sample must be one of ${EVENTS.join(", ")}`);
  const loanId = "L-1057";
  const recipientRole = ["requested", "return_reported"].includes(event) ? "owner" : "borrower";
  return {
    idempotencyKey: event === "overdue_reminder" ? `reminder:${loanId}:2026-11-05` : `notify:${loanId}:${event}`,
    attempt: 1,
    event,
    loanId,
    toolName: "Bosch cordless drill",
    startDate: "2026-11-07",
    endDate: "2026-11-09",
    recipientRole,
    recipientFirstName: recipientRole === "owner" ? "Rina" : "Maya",
    recipientEmail: to,
  };
}

function sign(secret, timestamp, rawBody) {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")}`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const [target, json] = opts.positional;
  if (!target) usage("missing <path|url>");

  const secretEnv = opts["secret-env"] ?? "CONVEX_INBOUND_SECRET";
  const secret = process.env[secretEnv];
  if (!secret) usage(`${secretEnv} is not set (try: node --env-file=n8n/.env ...)`);

  const base = (opts.base ?? process.env.CONVEX_SITE_URL ?? "http://127.0.0.1:3211")
    // CONVEX_SITE_URL in n8n/.env points at host.docker.internal for the container; from the host use loopback.
    .replace("host.docker.internal", "127.0.0.1")
    .replace(/\/+$/, "");
  const url = /^https?:\/\//.test(target) ? target : `${base}${target.startsWith("/") ? "" : "/"}${target}`;

  let body;
  try {
    body = opts.sample ? samplePayload(opts.sample, opts.to ?? "maya@example.test") : JSON.parse(json ?? "{}");
  } catch {
    usage("body is not valid JSON");
  }
  const rawBody = JSON.stringify(body);

  let timestamp = Math.floor(Date.now() / 1000);
  if (opts.flags.has("stale")) timestamp -= 600;
  const signingSecret = opts.flags.has("bad-signature") ? `${secret}-wrong` : secret;
  const signature = sign(signingSecret, String(timestamp), rawBody);
  const sentBody = opts.flags.has("tamper") ? rawBody.replace(/.$/, " }") : rawBody;

  const headers = { "Content-Type": "application/json" };
  if (!opts.flags.has("no-signature")) {
    headers["X-LendLoop-Timestamp"] = String(timestamp);
    headers["X-LendLoop-Signature"] = signature;
  }
  if (typeof body.idempotencyKey === "string") headers["X-Idempotency-Key"] = body.idempotencyKey;

  // Never print the secret or the signature; the body is test data the caller provided.
  console.error(`POST ${url}  (secret: ${secretEnv}${opts.flags.size ? `, ${[...opts.flags].join(", ")}` : ""})`);
  const res = await fetch(url, { method: "POST", headers, body: sentBody });
  const text = await res.text();
  console.log(`${res.status} ${res.statusText}`);
  if (text) console.log(text);
  process.exitCode = res.ok ? 0 : 1;
}

main().catch((err) => {
  console.error(`request failed: ${err.cause?.code ?? err.message}`);
  process.exit(1);
});
