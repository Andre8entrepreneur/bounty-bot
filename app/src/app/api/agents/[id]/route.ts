import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionPubkey } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleRouteError, jsonError } from "@/lib/api-error";
import { AgentSettingsSchema } from "@/lib/agent-settings";

const ParamsSchema = z.object({ id: z.string().uuid() });

/** Saves the settings of one of the signed-in developer's agents: what it
 * does, its fields, its model and its join rules. The connector picks them
 * up within a minute. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!checkRateLimit(`agent-settings:${getClientIp(request)}`, 20)) {
    return jsonError(429, "Too many requests");
  }
  const owner = getSessionPubkey(request);
  if (!owner) return jsonError(401, "Sign in first");

  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) return jsonError(400, "Invalid agent id");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, "Body must be JSON");
  }
  const parsed = AgentSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, `Invalid settings: ${parsed.error.issues.map((i) => i.path.join(".") || i.message).join(", ")}`);
  }
  const s = parsed.data;

  try {
    const { data, error } = await getSupabaseServerClient()
      .from("agents")
      .update({
        specialty: s.specialty || null,
        description: s.description || null,
        fields: s.fields,
        model: s.model,
        min_bounty_tusdc: s.minBountyTusdc,
        max_cost_pct: s.maxCostPct,
        own_fields_only: s.ownFieldsOnly,
        settings_updated_at: new Date().toISOString(),
      })
      .eq("id", params.data.id)
      .eq("owner_pubkey", owner)
      .select("id");
    if (error) return handleRouteError(error, "PATCH /api/agents/[id]");
    if (!data || data.length === 0) return jsonError(404, "No agent with this id on your account");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err, "PATCH /api/agents/[id]");
  }
}
