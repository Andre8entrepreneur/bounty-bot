import { NextResponse } from "next/server";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { BrandKitSchema } from "@/lib/agents/schema";
import { sanitizeSvg } from "@/lib/agents/sanitize-svg";
import { hash } from "@/lib/hash";
import { getServerEnv } from "@/lib/env";
import {
  fetchBountyByAddress,
  fetchEntry,
  findEntryPda,
  getConnection,
  getProgram,
} from "@/lib/solana/client";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleRouteError, jsonError } from "@/lib/api-error";
import type { BountyRow } from "@/lib/types";

export const maxDuration = 60;

const ParamsSchema = z.object({ id: z.string().uuid() });

const BodySchema = z.object({
  agentPubkey: z.string().min(32).max(44),
  kit: BrandKitSchema,
});

/** Lets any agent that already called submit_entry publish the kit behind
 * its on-chain content hash, so it gets a preview and a referee score like
 * our own agents. No signature needed: the hash committed on-chain is the
 * authentication — only the exact kit that was committed can be published,
 * so nobody can post someone else's entry with different content. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!checkRateLimit(getClientIp(request))) {
    return jsonError(429, "Too many requests");
  }

  const parsedParams = ParamsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return jsonError(400, "Invalid bounty id");
  }
  const { id: bountyRowId } = parsedParams.data;

  let body: z.infer<typeof BodySchema>;
  let agentPubkey: PublicKey;
  try {
    body = BodySchema.parse(await request.json());
    agentPubkey = new PublicKey(body.agentPubkey);
  } catch {
    return jsonError(400, "Invalid request body");
  }

  const supabase = getSupabaseServerClient();

  try {
    const { data: bountyRow } = await supabase
      .from("bounties")
      .select("*")
      .eq("id", bountyRowId)
      .single<BountyRow>();
    if (!bountyRow) {
      return jsonError(404, "Bounty not found");
    }

    // Must land before the deadline: the referee scores whatever is
    // published when submissions close, and only runs once.
    if (!bountyRow.deadline || Date.now() >= new Date(bountyRow.deadline).getTime()) {
      return jsonError(400, "Submissions are closed for this bounty");
    }

    const env = getServerEnv();
    const connection = getConnection(env.SOLANA_RPC_URL);
    const program = getProgram(connection);
    const bountyPda = new PublicKey(bountyRow.onchain_address);

    const [onchainBounty, onchainEntry] = await Promise.all([
      fetchBountyByAddress(program, bountyPda),
      fetchEntry(program, bountyPda, agentPubkey),
    ]);
    if (!onchainBounty || Object.keys(onchainBounty.status)[0] !== "open") {
      return jsonError(400, "Bounty is not open on-chain");
    }
    if (!onchainEntry) {
      return jsonError(404, "No on-chain entry from this agent for this bounty — call submit_entry first");
    }

    // Logos are stored and rendered only in sanitized form. Requiring the
    // committed SVG to already be in that form (sanitizing is idempotent)
    // keeps what we store byte-identical to what the hash commits to.
    let sanitizedSvg: string;
    try {
      sanitizedSvg = sanitizeSvg(body.kit.logoSvg);
    } catch (err) {
      return jsonError(400, err instanceof Error ? err.message : "Invalid logo SVG");
    }
    if (sanitizedSvg !== body.kit.logoSvg) {
      return jsonError(400, "logoSvg must already be sanitized before hashing and submitting");
    }

    const committedHash = Buffer.from(onchainEntry.contentHash).toString("hex");
    if (hash(body.kit) !== committedHash) {
      return jsonError(400, "Kit does not match the content hash committed on-chain");
    }

    const logoPath = `${bountyRowId}/${agentPubkey.toBase58()}.svg`;
    const { error: uploadError } = await supabase.storage
      .from("kits")
      .upload(logoPath, Buffer.from(body.kit.logoSvg, "utf8"), {
        contentType: "image/svg+xml",
        upsert: true,
      });
    if (uploadError) {
      return handleRouteError(uploadError, "POST entries: storage upload");
    }

    // The entry account is written once, by submit_entry — so (before the
    // deadline, i.e. before any pick) its only transaction is the submission.
    const [entryPda] = findEntryPda(bountyPda, agentPubkey, program.programId);
    const sigs = await connection.getSignaturesForAddress(entryPda, { limit: 10 });
    const submitTx = sigs.filter((s) => s.err === null).at(-1)?.signature ?? null;

    const { error: insertError } = await supabase.from("entries").insert({
      bounty_id: bountyRowId,
      agent_key: null,
      agent_pubkey: agentPubkey.toBase58(),
      kit: body.kit,
      logo_path: logoPath,
      content_hash: committedHash,
      submit_tx: submitTx,
    });
    if (insertError) {
      if (insertError.code === "23505") {
        return jsonError(409, "This agent's kit is already published for this bounty");
      }
      return handleRouteError(insertError, "POST entries: insert");
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, "POST /api/bounties/[id]/entries");
  }
}
