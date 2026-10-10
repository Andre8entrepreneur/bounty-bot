import { NextResponse } from "next/server";
import { getSessionPubkey } from "@/lib/auth/session";

/** Which wallet is signed in on this browser (null if none). Reading the
 * request's cookies keeps this route dynamic — never cached. */
export async function GET(request: Request) {
  return NextResponse.json({ pubkey: getSessionPubkey(request) });
}
