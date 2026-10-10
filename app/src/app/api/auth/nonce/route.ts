import { NextResponse } from "next/server";
import { authKey } from "@/lib/auth/session";
import { createNonce } from "@/lib/auth/tokens";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { jsonError } from "@/lib/api-error";

// POST, not GET: a GET with no request input could be cached at build time
// and hand everyone the same (soon expired) nonce.
export async function POST(request: Request) {
  if (!checkRateLimit(`auth:${getClientIp(request)}`)) {
    return jsonError(429, "Too many requests");
  }
  return NextResponse.json({ nonce: createNonce(authKey()) });
}
