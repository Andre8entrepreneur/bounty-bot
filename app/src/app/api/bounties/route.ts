import { NextResponse } from "next/server";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { BriefSchema } from "@/lib/agents/schema";
import { hash } from "@/lib/hash";
import { getServerEnv } from "@/lib/env";
import { fetchBountyByAddress, fetchConfig, getConnection, getProgram } from "@/lib/solana/client";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleRouteError, jsonError } from "@/lib/api-error";

export const maxDuration = 300;

const BodySchema = z.object({
  address: z.string().min(32).max(44),
  txSig: z.string().min(1),
  brief: BriefSchema,
});

export async function POST(request: Request) {
  if (!checkRateLimit(`register:${getClientIp(request)}`)) {
    return jsonError(429, "Too many requests");
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return jsonError(400, "Invalid request body");
  }

  let bountyAddress: PublicKey;
  try {
    bountyAddress = new PublicKey(body.address);
  } catch {
    return jsonError(400, "Invalid bounty address");
  }

  try {
    const env = getServerEnv();
    const connection = getConnection(env.SOLANA_RPC_URL);
    const program = getProgram(connection);

    const [bounty, config] = await Promise.all([
      fetchBountyByAddress(program, bountyAddress),
      fetchConfig(program),
    ]);

    if (!bounty) {
      return jsonError(404, "Bounty not found on-chain");
    }
    if (!config) {
      return jsonError(500, "Program config not found on-chain");
    }

    const statusKey = Object.keys(bounty.status)[0];
    if (statusKey !== "open") {
      return jsonError(400, "Bounty is not open");
    }

    if (!bounty.mint.equals(config.mint)) {
      return jsonError(400, "Bounty uses the wrong mint");
    }

    const actualHash = Buffer.from(bounty.briefHash).toString("hex");
    if (hash(body.brief) !== actualHash) {
      return jsonError(400, "Brief hash does not match the on-chain bounty");
    }

    const deadlineMs = bounty.deadline.toNumber() * 1000;
    if (deadlineMs <= Date.now()) {
      return jsonError(400, "Bounty deadline has already passed");
    }

    const supabase = getSupabaseServerClient();
    const { data: inserted, error } = await supabase
      .from("bounties")
      .insert({
        onchain_address: body.address,
        bounty_id: bounty.bountyId.toString(),
        buyer: bounty.buyer.toBase58(),
        amount: bounty.amount.toNumber(),
        deadline: new Date(deadlineMs).toISOString(),
        pick_deadline: new Date(bounty.pickDeadline.toNumber() * 1000).toISOString(),
        brief: body.brief,
        brief_hash: actualHash,
        status: "open",
        create_tx: body.txSig,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !inserted) {
      return jsonError(409, "Bounty already recorded, or insert failed");
    }

    return NextResponse.json({ ok: true, id: inserted.id }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, "POST /api/bounties");
  }
}
