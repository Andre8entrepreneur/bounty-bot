import { NextResponse } from "next/server";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { getServerEnv } from "@/lib/env";
import { hash } from "@/lib/hash";
import { BriefSchema } from "@/lib/agents/schema";
import { runAgent } from "@/lib/agents/run-agent";
import {
  buildSubmitEntryIx,
  fetchBountyByAddress,
  getConnection,
  getProgram,
  sendSignedInstruction,
} from "@/lib/solana/client";
import { getAgentKeypair } from "@/lib/solana/keys";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleRouteError, jsonError } from "@/lib/api-error";
import type { BountyRow } from "@/lib/types";

export const maxDuration = 300;

const ParamsSchema = z.object({
  id: z.string().uuid(),
  agent: z.enum(["minimal", "bold", "luxe"]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; agent: string }> },
) {
  if (!checkRateLimit(getClientIp(request))) {
    return jsonError(429, "Too many requests");
  }

  const parsedParams = ParamsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return jsonError(400, "Invalid bounty id or agent");
  }
  const { id: bountyRowId, agent: agentKey } = parsedParams.data;

  const supabase = getSupabaseServerClient();

  try {
    const { data: bountyRow, error: fetchError } = await supabase
      .from("bounties")
      .select("*")
      .eq("id", bountyRowId)
      .single<BountyRow>();

    if (fetchError || !bountyRow) {
      return jsonError(404, "Bounty not found");
    }

    const env = getServerEnv();
    const connection = getConnection(env.SOLANA_RPC_URL);
    const program = getProgram(connection);

    const onchainBounty = await fetchBountyByAddress(
      program,
      new PublicKey(bountyRow.onchain_address),
    );
    if (!onchainBounty || Object.keys(onchainBounty.status)[0] !== "open") {
      return jsonError(400, "Bounty is not open on-chain");
    }

    const deadlineMs = onchainBounty.deadline.toNumber() * 1000;
    if (Date.now() >= deadlineMs - 15_000) {
      return jsonError(400, "Too close to (or past) the deadline to start a run");
    }

    // Atomic claim: the (bounty_id, agent_key) primary key rejects a second
    // concurrent/duplicate run with a unique-violation.
    const { error: insertRunError } = await supabase.from("agent_runs").insert({
      bounty_id: bountyRowId,
      agent_key: agentKey,
      status: "running",
      started_at: new Date().toISOString(),
    });

    if (insertRunError) {
      if (insertRunError.code === "23505") {
        return jsonError(409, "This agent has already run for this bounty");
      }
      return handleRouteError(insertRunError, "POST run: insert agent_runs");
    }

    try {
      const brief = BriefSchema.parse(bountyRow.brief);
      const kit = await runAgent(agentKey, brief);

      const agentKeypair = getAgentKeypair(agentKey);
      const logoPath = `${bountyRowId}/${agentKey}.svg`;

      const { error: uploadError } = await supabase.storage
        .from("kits")
        .upload(logoPath, Buffer.from(kit.logoSvg, "utf8"), {
          contentType: "image/svg+xml",
          upsert: true,
        });
      if (uploadError) {
        throw new Error(`storage upload failed: ${uploadError.message}`);
      }

      const contentHashHex = hash(kit);

      const { error: insertEntryError } = await supabase.from("entries").insert({
        bounty_id: bountyRowId,
        agent_key: agentKey,
        agent_pubkey: agentKeypair.publicKey.toBase58(),
        kit,
        logo_path: logoPath,
        content_hash: contentHashHex,
      });
      if (insertEntryError) {
        throw new Error(`insert entries failed: ${insertEntryError.message}`);
      }

      const buyer = new PublicKey(bountyRow.buyer ?? onchainBounty.buyer.toBase58());
      const bountyId = BigInt(bountyRow.bounty_id ?? onchainBounty.bountyId.toString());

      const ix = await buildSubmitEntryIx(program, {
        agent: agentKeypair.publicKey,
        buyer,
        bountyId,
        contentHash: Buffer.from(contentHashHex, "hex"),
      });
      const submitTx = await sendSignedInstruction(connection, ix, agentKeypair);

      await supabase
        .from("entries")
        .update({ submit_tx: submitTx })
        .eq("bounty_id", bountyRowId)
        .eq("agent_key", agentKey);

      await supabase
        .from("agent_runs")
        .update({ status: "done", finished_at: new Date().toISOString() })
        .eq("bounty_id", bountyRowId)
        .eq("agent_key", agentKey);

      return NextResponse.json({ ok: true, submitTx });
    } catch (runErr) {
      const message = runErr instanceof Error ? runErr.message : String(runErr);
      await supabase
        .from("agent_runs")
        .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
        .eq("bounty_id", bountyRowId)
        .eq("agent_key", agentKey);
      console.error(`[run ${agentKey}]`, runErr);
      return jsonError(500, "Agent run failed");
    }
  } catch (err) {
    return handleRouteError(err, "POST /api/bounties/[id]/run/[agent]");
  }
}
