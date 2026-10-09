import { NextResponse } from "next/server";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { getServerEnv } from "@/lib/env";
import {
  buildAutoAwardIx,
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
import type { BountyRow, EntryRow } from "@/lib/types";

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

    const buyer = new PublicKey(bountyRow.buyer ?? onchainBounty.buyer.toBase58());
    const bountyId = BigInt(bountyRow.bounty_id ?? onchainBounty.bountyId.toString());
    const platformKeypair = getPlatformKeypair();

    const { data: passingEntries, error: entriesError } = await supabase
      .from("entries")
      .select("*")
      .eq("bounty_id", bountyRowId)
      .eq("referee_pass", true)
      .order("referee_score", { ascending: false })
      .limit(1)
      .returns<EntryRow[]>();

    if (entriesError) {
      return handleRouteError(entriesError, "POST settle: select entries");
    }

    const topEntry = passingEntries?.[0];

    if (!topEntry) {
      // No entry passes: refund as soon as the deadline has passed, don't
      // wait for pick_deadline — there's nothing for the buyer to pick.
      const ix = await buildRefundIx(program, {
        signer: platformKeypair.publicKey,
        buyer,
        bountyId,
        mint: config.mint,
      });
      const settleTx = await sendSignedInstruction(connection, ix, platformKeypair);

      await supabase
        .from("bounties")
        .update({ status: "refunded", settle_tx: settleTx })
        .eq("id", bountyRowId);

      return NextResponse.json({ ok: true, settled: true, action: "refund", settleTx });
    }

    if (now < pickDeadlineMs) {
      // A passing entry exists but the buyer still has time to pick manually.
      return NextResponse.json({ ok: true, settled: false, reason: "pick window still open" });
    }

    const ix = await buildAutoAwardIx(program, {
      admin: platformKeypair.publicKey,
      buyer,
      bountyId,
      mint: config.mint,
      treasury: config.treasury,
      winnerAgent: new PublicKey(topEntry.agent_pubkey ?? ""),
    });
    const settleTx = await sendSignedInstruction(connection, ix, platformKeypair);

    await supabase
      .from("bounties")
      .update({ status: "awarded", winner_agent: topEntry.agent_key, settle_tx: settleTx })
      .eq("id", bountyRowId);

    return NextResponse.json({ ok: true, settled: true, action: "auto_award", settleTx });
  } catch (err) {
    return handleRouteError(err, "POST /api/bounties/[id]/settle");
  }
}
