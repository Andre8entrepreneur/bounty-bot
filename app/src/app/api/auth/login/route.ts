import { NextResponse } from "next/server";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { verifyWalletSignature } from "@/lib/auth/ed25519";
import { signInMessage } from "@/lib/auth/messages";
import { authKey, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth/session";
import { createSessionToken, verifyNonce } from "@/lib/auth/tokens";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { jsonError } from "@/lib/api-error";

const BodySchema = z.object({
  pubkey: z.string().min(32).max(44),
  nonce: z.string().min(1).max(200),
  signature: z.string().min(1).max(120),
});

/** Sign-in with a Solana wallet: the wallet signs a message containing a
 * fresh server nonce; if the signature checks out, we set a session cookie. */
export async function POST(request: Request) {
  if (!checkRateLimit(`auth:${getClientIp(request)}`)) {
    return jsonError(429, "Too many requests");
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
    new PublicKey(body.pubkey);
  } catch {
    return jsonError(400, "Invalid request body");
  }

  if (!verifyNonce(authKey(), body.nonce)) {
    return jsonError(401, "Sign-in request expired — try again");
  }
  if (!verifyWalletSignature(body.pubkey, signInMessage(body.pubkey, body.nonce), body.signature)) {
    return jsonError(401, "Signature does not match this wallet");
  }

  const res = NextResponse.json({ pubkey: body.pubkey });
  res.cookies.set(SESSION_COOKIE, createSessionToken(authKey(), body.pubkey), SESSION_COOKIE_OPTIONS);
  return res;
}
