import { NextResponse } from "next/server";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { getServerEnv } from "@/lib/env";
import {
  buildRefundIx,
  fetchBountyByAddress,
  fetchConfig,
  getConnection,
  getProgram,
  sendSignedInstruction,
} from "@/lib/solana/client";
import { getPlatformKeypair } from "@/lib/solana/keys";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleRouteError, jsonError } from "@/lib/api-error";
import type { BountyRow } from "@/lib/types";

export const maxDuration = 300;

const ParamsSchema = z.object({ id: z.string().uuid() });

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

    const [onchainBounty, config] = await Promise.all([
      fetchBountyByAddress(program, new PublicKey(bountyRow.onchain_address)),
      fetchConfig(program),
    ]);

    if (!onchainBounty || !config) {
      return jsonError(404, "Bounty or config not found on-chain");
    }

    const statusKey = Object.keys(onchainBounty.status)[0];
    if (statusKey !== "open") {
      // Already settled on-chain — idempotent no-op.
      return NextResponse.json({ ok: true, alreadySettled: true, status: statusKey });
    }

    const now = Date.now();
    const deadlineMs = onchainBounty.deadline.toNumber() * 1000;
    const pickDeadlineMs = onchainBounty.pickDeadline.toNumber() * 1000;

    if (now < deadlineMs) {
      return NextResponse.json({ ok: true, settled: false, reason: "before deadline" });
    }

    // With entries in, the buyer gets the whole pick window — they may pick
    // any entry, passed or failed. Only an empty bounty refunds right away.
    const entryCount = onchainBounty.entryCount;
    if (entryCount > 0 && now < pickDeadlineMs) {
      return NextResponse.json({ ok: true, settled: false, reason: "pick window still open" });
    }

    // Nobody entered, or the buyer let the pick window close without
    // choosing: full refund. The platform never picks a winner on the
    // buyer's behalf (the program's auto_award is deliberately unused).
    const platformKeypair = getPlatformKeypair();
    const ix = await buildRefundIx(program, {
      signer: platformKeypair.publicKey,
      buyer: new PublicKey(bountyRow.buyer ?? onchainBounty.buyer.toBase58()),
      bountyId: BigInt(bountyRow.bounty_id ?? onchainBounty.bountyId.toString()),
      mint: config.mint,
    });
    const settleTx = await sendSignedInstruction(connection, ix, platformKeypair);

    await supabase
      .from("bounties")
      .update({ status: "refunded", settle_tx: settleTx })
      .eq("id", bountyRowId);

    return NextResponse.json({
      ok: true,
      settled: true,
      action: "refund",
      reason: entryCount === 0 ? "no entries" : "buyer did not pick",
      settleTx,
    });
  } catch (err) {
    return handleRouteError(err, "POST /api/bounties/[id]/settle");
  }
}
