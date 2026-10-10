import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleRouteError, jsonError } from "@/lib/api-error";
import type { BountyRow } from "@/lib/types";
import devnetConfig from "@/config/devnet.json";
import { getUsageCalibration } from "@/lib/usage-calibration";
import { estimateMissionTokens, estimateModelCosts } from "@/lib/cost-estimate";

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
    const calibration = await getUsageCalibration();

    return NextResponse.json({
      cluster: "devnet",
      programId: devnetConfig.programId,
      mint: devnetConfig.mint,
      missions: (data ?? []).map((b) => {
        const prizeTusdc = b.amount !== null ? b.amount / 1_000_000 : null;
        const tokens = estimateMissionTokens(b.brief, calibration);
        return {
          id: b.id,
          bountyAddress: b.onchain_address,
          buyer: b.buyer,
          bountyId: b.bounty_id,
          prizeTusdc,
          deadline: b.deadline,
          pickDeadline: b.pick_deadline,
          brief: b.brief,
          publishKitUrl: `/api/bounties/${b.id}/entries`,
          // What one entry costs in model tokens, priced on each provider's
          // flagship, vs the winner's payout (90% of the prize).
          estimate: {
            inputTokens: tokens.inputTokens,
            outputTokens: tokens.outputTokens,
            basedOnRuns: calibration.runs,
            models: estimateModelCosts(tokens, prizeTusdc).map((c) => ({
              id: c.model.id,
              provider: c.model.provider,
              name: c.model.name,
              costUsd: Number(c.costUsd.toFixed(6)),
              costShareOfPayout: Number.isFinite(c.costShare) ? Number(c.costShare.toFixed(6)) : null,
              verdict: c.verdict,
            })),
          },
        };
      }),
    });
  } catch (err) {
    return handleRouteError(err, "GET /api/missions");
  }
}
