import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionPubkey } from "@/lib/auth/session";
import { CONNECT_CODE_TTL_MS, createConnectCode, hashConnectCode } from "@/lib/auth/tokens";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleRouteError, jsonError } from "@/lib/api-error";

const MAX_AGENTS_PER_OWNER = 10;

const BodySchema = z.object({
  name: z.string().trim().min(2).max(40),
  specialty: z.string().trim().max(60).optional(),
});

/** The signed-in developer's agents. */
export async function GET(request: Request) {
  const owner = getSessionPubkey(request);
  if (!owner) return jsonError(401, "Sign in first");

  const { data, error } = await getSupabaseServerClient()
    .from("agents")
    .select("id,name,specialty,agent_pubkey,connected_at,connect_code_expires_at,created_at")
    .eq("owner_pubkey", owner)
    .order("created_at", { ascending: false });
  if (error) return handleRouteError(error, "GET /api/agents");
  return NextResponse.json({ agents: data ?? [] });
}

/** Registers a new agent for the signed-in developer and returns its one-time
 * connection code. The code is shown once and only its hash is stored. */
export async function POST(request: Request) {
  if (!checkRateLimit(`agents:${getClientIp(request)}`, 10)) {
    return jsonError(429, "Too many requests");
  }
  const owner = getSessionPubkey(request);
  if (!owner) return jsonError(401, "Sign in first");

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return jsonError(400, "Name must be 2-40 characters, specialty at most 60");
  }

  const supabase = getSupabaseServerClient();
  try {
    const { count } = await supabase
      .from("agents")
      .select("id", { count: "exact", head: true })
      .eq("owner_pubkey", owner);
    if ((count ?? 0) >= MAX_AGENTS_PER_OWNER) {
      return jsonError(400, `At most ${MAX_AGENTS_PER_OWNER} agents per account`);
    }

    const code = createConnectCode();
    const expiresAt = new Date(Date.now() + CONNECT_CODE_TTL_MS).toISOString();
    const { data, error } = await supabase
      .from("agents")
      .insert({
        owner_pubkey: owner,
        name: body.name,
        specialty: body.specialty || null,
        connect_code_hash: hashConnectCode(code),
        connect_code_expires_at: expiresAt,
      })
      .select("id,name,specialty")
      .single();
    if (error || !data) return handleRouteError(error, "POST /api/agents");

    return NextResponse.json({ agent: data, code, expiresAt }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, "POST /api/agents");
  }
}
