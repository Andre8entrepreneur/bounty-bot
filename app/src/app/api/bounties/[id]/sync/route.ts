import { NextResponse } from "next/server";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { getServerEnv } from "@/lib/env";
import { fetchBountyByAddress, getConnection, getProgram } from "@/lib/solana/client";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleRouteError, jsonError } from "@/lib/api-error";
import type { BountyRow, DbBountyStatus } from "@/lib/types";

export const maxDuration = 300;

const ParamsSchema = z.object({ id: z.string().uuid() });

/** Re-reads on-chain bounty state into the DB row — used after a buyer's
 * browser-side pick_winner call (built in Bloc 4) so the DB reflects the
 * on-chain outcome without waiting for the next poll/settle cycle. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!checkRateLimit(getClientIp(request))) {
    return jsonError(429, "Too many requests");
  }

  const parsedParams = ParamsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return jsonError(400, "Invalid bounty id");
  }
  const { id: bountyRowId } = parsedParams.data;

  const supabase = getSupabaseServerClient();

  try {
    const { data: bountyRow, error: bountyError } = await supabase
      .from("bounties")
      .select("*")
      .eq("id", bountyRowId)
      .single<BountyRow>();

    if (bountyError || !bountyRow) {
      return jsonError(404, "Bounty not found");
    }

    const env = getServerEnv();
    const connection = getConnection(env.SOLANA_RPC_URL);
    const program = getProgram(connection);

    const onchainBounty = await fetchBountyByAddress(
      program,
      new PublicKey(bountyRow.onchain_address),
    );
    if (!onchainBounty) {
      return jsonError(404, "Bounty not found on-chain");
    }

    const status = Object.keys(onchainBounty.status)[0] as DbBountyStatus;

    let winnerAgentKey: string | null = null;
    if (onchainBounty.winner) {
      const winnerPubkey = (onchainBounty.winner as PublicKey).toBase58();
      const { data: winningEntry } = await supabase
        .from("entries")
        .select("agent_key")
        .eq("bounty_id", bountyRowId)
        .eq("agent_pubkey", winnerPubkey)
        .maybeSingle<{ agent_key: string }>();
      // Falls back to the raw winner pubkey when no DB entries row matches —
      // a third-party agent submitted directly on-chain, so we never had a
      // row for it to begin with. Still a correct, honest winner_agent
      // value; the UI knows how to render a persona label vs. a raw pubkey.
      winnerAgentKey = winningEntry?.agent_key ?? winnerPubkey;
    }

    await supabase
      .from("bounties")
      .update({ status, winner_agent: winnerAgentKey })
      .eq("id", bountyRowId);

    return NextResponse.json({ ok: true, status, winnerAgent: winnerAgentKey });
  } catch (err) {
    return handleRouteError(err, "POST /api/bounties/[id]/sync");
  }
}
