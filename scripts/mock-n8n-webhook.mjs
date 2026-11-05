#!/usr/bin/env node
// n8n-less fallback for local testing: a tiny HTTP server that stands in for the
// "LendLoop · Request notifications" webhook. It verifies Convex's outbound
// signature with N8N_WEBHOOK_SECRET (same rules as lib/domain/signing.ts) and
// logs only the payload FIELD NAMES, never values (they include an email address).
//
//   node --env-file=n8n/.env scripts/mock-n8n-webhook.mjs            # listens on :5678
//   PORT=5679 node --env-file=n8n/.env scripts/mock-n8n-webhook.mjs
//
// Point Convex at it with:
//   npx convex env set N8N_REQUEST_WEBHOOK_URL http://localhost:5678/webhook/lendloop/request-events
//
// It does not write delivery status back, so deliveries stay "accepted" in the
// admin Automation page. Use scripts/sign-and-send.mjs to simulate a write-back.

import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 5678);
const PATH = "/webhook/lendloop/request-events";
const TOLERANCE_SEC = 300;
const MAX_BODY_BYTES = 64 * 1024;

const secret = process.env.N8N_WEBHOOK_SECRET;
if (!secret) {
  console.error("N8N_WEBHOOK_SECRET is not set (try: node --env-file=n8n/.env scripts/mock-n8n-webhook.mjs)");
  process.exit(2);
}

let executionSeq = 0;

function verify(rawBody, timestamp, signature) {
  if (!timestamp || !signature) return "missing_headers";
  if (!/^\d{1,12}$/.test(timestamp)) return "bad_timestamp";
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > TOLERANCE_SEC) return "stale";
  const m = /^v1=([0-9a-f]{64})$/i.exec(signature.trim());
  if (!m) return "malformed";
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  return timingSafeEqual(expected, Buffer.from(m[1], "hex")) ? null : "mismatch";
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

createServer((req, res) => {
  if (req.method !== "POST" || req.url !== PATH) return send(res, 404, { error: "not_found" });

  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) req.destroy();
    else chunks.push(chunk);
  });
  req.on("end", () => {
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const reason = verify(rawBody, req.headers["x-lendloop-timestamp"], req.headers["x-lendloop-signature"]);
    const at = new Date().toISOString();
    if (reason) {
      console.log(`${at} 401 rejected reason=${reason}`);
      return send(res, 401, { error: "invalid_signature" });
    }
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.log(`${at} 400 signed body is not JSON`);
      return send(res, 400, { error: "invalid_payload" });
    }
    const executionId = `mock_${Date.now()}_${++executionSeq}`;
    // Event + key are not personal data; everything else is listed by name only.
    console.log(
      `${at} 202 event=${payload.event} key=${payload.idempotencyKey} attempt=${payload.attempt} execution=${executionId}\n` +
        `    fields: ${Object.keys(payload).join(", ")}`,
    );
    send(res, 202, { accepted: true, executionId });
  });
}).listen(PORT, () => {
  console.log(`mock n8n webhook listening on http://localhost:${PORT}${PATH}`);
});
