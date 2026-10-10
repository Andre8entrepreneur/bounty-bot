import "server-only";
import { createHmac } from "node:crypto";
import { getServerEnv } from "../env";
import { readSessionToken, SESSION_TTL_MS } from "./tokens";

export const SESSION_COOKIE = "bb_session";

let cachedKey: Buffer | undefined;

/** Signing key for nonces and session cookies, derived from an existing
 * server secret so there's no new env var to provision. Rotating that secret
 * simply logs everyone out. */
export function authKey(): Buffer {
  cachedKey ??= createHmac("sha256", getServerEnv().SUPABASE_SERVICE_ROLE_KEY)
    .update("bounty-bot:auth:v1")
    .digest();
  return cachedKey;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** The wallet signed in on this request, or null. */
export function getSessionPubkey(request: Request): string | null {
  const token = readCookie(request, SESSION_COOKIE);
  return token ? readSessionToken(authKey(), token) : null;
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_MS / 1000,
};
