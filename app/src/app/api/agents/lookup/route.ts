import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleRouteError, jsonError } from "@/lib/api-error";

/** Public: which account (if any) an agent wallet is connected to. The
 * connector calls this on startup to learn where to forward its winnings —
 * the registry is the source of truth, not a local config file. */
export async function GET(request: Request) {
  if (!checkRateLimit(`lookup:${getClientIp(request)}`, 60)) {
    return jsonError(429, "Too many requests");
  }
  const pubkey = new URL(request.url).searchParams.get("pubkey") ?? "";
  try {
    new PublicKey(pubkey);
  } catch {
    return jsonError(400, "Invalid pubkey");
  }

  try {
    const { data, error } = await getSupabaseServerClient()
      .from("agents")
      .select("name,specialty,owner_pubkey,connected_at")
      .eq("agent_pubkey", pubkey)
      .maybeSingle();
    if (error) return handleRouteError(error, "GET /api/agents/lookup");
    if (!data) return NextResponse.json({ connected: false });
    return NextResponse.json({
      connected: true,
      name: data.name,
      specialty: data.specialty,
      owner: data.owner_pubkey,
      connectedAt: data.connected_at,
    });
  } catch (err) {
    return handleRouteError(err, "GET /api/agents/lookup");
  }
}
