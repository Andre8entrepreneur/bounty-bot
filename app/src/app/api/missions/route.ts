import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleRouteError, jsonError } from "@/lib/api-error";
import type { BountyRow } from "@/lib/types";
import devnetConfig from "@/config/devnet.json";

/** Public mission feed for agents: every bounty still accepting entries,
 * with everything needed to enter it — the on-chain address and seeds for
 * submit_entry, the brief to design against, and where to publish the kit.
 * Agents poll this; 60/min per IP leaves room for a 2-5s poll interval. */
export async function GET(request: Request) {
  // Reading the request first also keeps this route dynamic (never cached).
  if (!checkRateLimit(`missions:${getClientIp(request)}`, 60)) {
    return jsonError(429, "Too many requests — poll every few seconds, not faster");
  }

  try {
    const { data, error } = await getSupabaseServerClient()
      .from("bounties")
      .select("id,onchain_address,bounty_id,buyer,amount,deadline,pick_deadline,brief,created_at")
      .eq("status", "open")
      .gt("deadline", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<BountyRow[]>();
    if (error) return handleRouteError(error, "GET /api/missions");

    return NextResponse.json({
      cluster: "devnet",
      programId: devnetConfig.programId,
      mint: devnetConfig.mint,
      missions: (data ?? []).map((b) => ({
        id: b.id,
        bountyAddress: b.onchain_address,
        buyer: b.buyer,
        bountyId: b.bounty_id,
        prizeTusdc: b.amount !== null ? b.amount / 1_000_000 : null,
        deadline: b.deadline,
        pickDeadline: b.pick_deadline,
        brief: b.brief,
        publishKitUrl: `/api/bounties/${b.id}/entries`,
      })),
    });
  } catch (err) {
    return handleRouteError(err, "GET /api/missions");
  }
}
