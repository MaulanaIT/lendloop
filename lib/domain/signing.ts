// HMAC-SHA256 request signing used in both directions:
//   Convex → n8n   signed with N8N_WEBHOOK_SECRET   (verified in the n8n workflow)
//   n8n → Convex   signed with CONVEX_INBOUND_SECRET (verified in convex/http.ts)
//
//   X-LendLoop-Timestamp: <unix seconds>
//   X-LendLoop-Signature: v1=<hex(HMAC_SHA256(secret, `${timestamp}.${rawBody}`))>
//
// Requests older/newer than SIGNATURE_TOLERANCE_SEC are rejected (replay window).
// Replays inside the window cannot create duplicate records (every write-back
// is idempotent); a replayed request event can at most re-send the same email
// (see docs/integration.md, "Replay window").
// Uses Web Crypto only, so it runs in Convex's runtime, Node and the browser.

export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const SIGNATURE_HEADER = "X-LendLoop-Signature";
export const IDEMPOTENCY_HEADER = "X-Idempotency-Key";
export const SIGNATURE_TOLERANCE_SEC = 300;

const encoder = new TextEncoder();

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function signingInput(timestamp: string, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

export async function signPayload(
  secret: string,
  rawBody: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<{ timestamp: string; signature: string }> {
  const timestamp = String(nowSec);
  const key = await hmacKey(secret, "sign");
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput(timestamp, rawBody)));
  return { timestamp, signature: `v1=${toHex(mac)}` };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_headers" | "bad_timestamp" | "stale" | "malformed" | "mismatch" };

/** Constant-time verification (crypto.subtle.verify) of a signed request. */
export async function verifySignature(
  secret: string,
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec: number = SIGNATURE_TOLERANCE_SEC,
): Promise<VerifyResult> {
  if (!timestamp || !signature) return { ok: false, reason: "missing_headers" };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "bad_timestamp" };
  if (Math.abs(nowSec - Number(timestamp)) > toleranceSec) return { ok: false, reason: "stale" };
  const m = /^v1=([0-9a-f]{64})$/i.exec(signature.trim());
  const bytes = m ? fromHex(m[1]) : null;
  if (!bytes) return { ok: false, reason: "malformed" };
  const key = await hmacKey(secret, "verify");
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    bytes as BufferSource,
    encoder.encode(signingInput(timestamp, rawBody)),
  );
  return ok ? { ok: true } : { ok: false, reason: "mismatch" };
}
