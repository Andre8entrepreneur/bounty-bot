// Pure auth primitives (no env access) so they can be unit-tested; the
// server wrapper in session.ts supplies the key.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const NONCE_TTL_MS = 5 * 60_000;
export const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;
export const CONNECT_CODE_TTL_MS = 30 * 60_000;

function mac(key: Buffer, purpose: string, body: string): string {
  return createHmac("sha256", key).update(`${purpose}:${body}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Stateless sign-in nonce: `issuedAtMs.random.mac` — no table needed, and it
 * expires on its own after NONCE_TTL_MS. */
export function createNonce(key: Buffer, now = Date.now()): string {
  const body = `${now}.${randomBytes(12).toString("base64url")}`;
  return `${body}.${mac(key, "nonce", body)}`;
}

export function verifyNonce(key: Buffer, nonce: string, now = Date.now()): boolean {
  const parts = nonce.split(".");
  if (parts.length !== 3) return false;
  const body = `${parts[0]}.${parts[1]}`;
  if (!safeEqual(parts[2], mac(key, "nonce", body))) return false;
  const issuedAt = Number(parts[0]);
  return Number.isFinite(issuedAt) && now >= issuedAt && now - issuedAt <= NONCE_TTL_MS;
}

/** Session cookie value: base64url({pk, exp}).mac */
export function createSessionToken(key: Buffer, pubkey: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ pk: pubkey, exp: now + SESSION_TTL_MS })).toString("base64url");
  return `${body}.${mac(key, "session", body)}`;
}

/** Returns the signed-in wallet, or null if the token is missing, forged,
 * malformed or expired. */
export function readSessionToken(key: Buffer, token: string, now = Date.now()): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!safeEqual(signature, mac(key, "session", body))) return null;
  try {
    const { pk, exp } = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      pk?: unknown;
      exp?: unknown;
    };
    if (typeof pk !== "string" || typeof exp !== "number" || exp < now) return null;
    return pk;
  } catch {
    return null;
  }
}

// No 0/O/1/I/L: the code gets read off a screen and typed or pasted.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** One-time agent connection code, e.g. "BB-7K2Q-M9XD" (~50 bits). */
export function createConnectCode(): string {
  const pick = (n: number) =>
    Array.from({ length: n }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `BB-${pick(4)}-${pick(4)}-${pick(2)}`;
}

/** Only the hash is stored, so a database leak doesn't hand out live codes. */
export function hashConnectCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}
