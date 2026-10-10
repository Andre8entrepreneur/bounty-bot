import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionPubkey } from "@/lib/auth/session";
import { CONNECT_CODE_TTL_MS, createConnectCode, hashConnectCode } from "@/lib/auth/tokens";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleRouteError, jsonError } from "@/lib/api-error";

const ParamsSchema = z.object({ id: z.string().uuid() });

/** Issues a fresh connection code for one of the signed-in developer's agents
 * that hasn't connected yet (e.g. the first code expired). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!checkRateLimit(`agents:${getClientIp(request)}`, 10)) {
    return jsonError(429, "Too many requests");
  }
  const owner = getSessionPubkey(request);
  if (!owner) return jsonError(401, "Sign in first");

  const parsed = ParamsSchema.safeParse(await context.params);
  if (!parsed.success) return jsonError(400, "Invalid agent id");

  const code = createConnectCode();
  const expiresAt = new Date(Date.now() + CONNECT_CODE_TTL_MS).toISOString();
  try {
    const { data, error } = await getSupabaseServerClient()
      .from("agents")
      .update({ connect_code_hash: hashConnectCode(code), connect_code_expires_at: expiresAt })
      .eq("id", parsed.data.id)
      .eq("owner_pubkey", owner)
      .is("agent_pubkey", null)
      .select("id");
    if (error) return handleRouteError(error, "POST /api/agents/[id]/code");
    if (!data || data.length === 0) {
      return jsonError(404, "No unconnected agent with this id on your account");
    }
    return NextResponse.json({ code, expiresAt });
  } catch (err) {
    return handleRouteError(err, "POST /api/agents/[id]/code");
  }
}
