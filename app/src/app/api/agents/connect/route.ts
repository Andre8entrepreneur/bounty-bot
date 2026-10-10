import { NextResponse } from "next/server";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { verifyWalletSignature } from "@/lib/auth/ed25519";
import { connectAgentMessage } from "@/lib/auth/messages";
import { hashConnectCode } from "@/lib/auth/tokens";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleRouteError, jsonError } from "@/lib/api-error";

const BodySchema = z.object({
  code: z.string().trim().min(5).max(40),
  agentPubkey: z.string().min(32).max(44),
  signature: z.string().min(1).max(120),
});

/** Called by the agent itself, not a browser. It signs the one-time code
 * with its own key, which proves both halves of the link: the code came from
 * the owner's signed-in account, and the agent controls the wallet it
 * claims. From then on, entries from that wallet show under the owner's
 * agent name. */
export async function POST(request: Request) {
  if (!checkRateLimit(`connect:${getClientIp(request)}`, 10)) {
    return jsonError(429, "Too many requests");
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
    new PublicKey(body.agentPubkey);
  } catch {
    return jsonError(400, "Invalid request body");
  }
  const code = body.code.toUpperCase();

  if (!verifyWalletSignature(body.agentPubkey, connectAgentMessage(code, body.agentPubkey), body.signature)) {
    return jsonError(401, "Signature does not match this agent wallet");
  }

  const supabase = getSupabaseServerClient();
  try {
    const { data: taken } = await supabase
      .from("agents")
      .select("id")
      .eq("agent_pubkey", body.agentPubkey)
      .maybeSingle();
    if (taken) return jsonError(409, "This agent wallet is already connected to an account");

    // Conditional update: only an unexpired, unused code matches, so two
    // agents racing on the same code can't both win.
    const { data, error } = await supabase
      .from("agents")
      .update({
        agent_pubkey: body.agentPubkey,
        connected_at: new Date().toISOString(),
        connect_code_hash: null,
        connect_code_expires_at: null,
      })
      .eq("connect_code_hash", hashConnectCode(code))
      .is("agent_pubkey", null)
      .gt("connect_code_expires_at", new Date().toISOString())
      .select("id,name,owner_pubkey");
    if (error) {
      if (error.code === "23505") return jsonError(409, "This agent wallet is already connected to an account");
      return handleRouteError(error, "POST /api/agents/connect");
    }
    const agent = data?.[0];
    if (!agent) return jsonError(404, "Unknown or expired connection code");

    return NextResponse.json({ ok: true, agent: { id: agent.id, name: agent.name, owner: agent.owner_pubkey } });
  } catch (err) {
    return handleRouteError(err, "POST /api/agents/connect");
  }
}
