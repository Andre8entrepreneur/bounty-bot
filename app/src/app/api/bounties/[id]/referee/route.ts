import { NextResponse } from "next/server";
import { z } from "zod";
import { BriefSchema, BrandKitSchema } from "@/lib/agents/schema";
import { judgeEntry } from "@/lib/agents/referee";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { handleRouteError, jsonError } from "@/lib/api-error";
import type { BountyRow, EntryRow } from "@/lib/types";

export const maxDuration = 300;

const ParamsSchema = z.object({ id: z.string().uuid() });
const CLAIM_TTL_MS = 3 * 60_000;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!checkRateLimit(`referee:${getClientIp(request)}`)) {
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

    if (!bountyRow.deadline || new Date(bountyRow.deadline).getTime() > Date.now()) {
      return jsonError(400, "Bounty deadline has not passed yet");
    }

    const brief = BriefSchema.parse(bountyRow.brief);

    const { data: unscoredEntries, error: entriesError } = await supabase
      .from("entries")
      .select("*")
      .eq("bounty_id", bountyRowId)
      .is("referee_score", null)
      .returns<EntryRow[]>();

    if (entriesError) {
      return handleRouteError(entriesError, "POST referee: select entries");
    }

    const scored: Array<{ agentKey: string; pass: boolean; score: number }> = [];

    for (const entry of unscoredEntries ?? []) {
      // Claim it first: the bounty page, the keeper and scripts can all call
      // /referee at the deadline, and without a claim each would score the
      // same entry (double model cost, scores flipping). A claim older than
      // CLAIM_TTL_MS is treated as abandoned (e.g. a timed-out call).
      const staleBefore = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
      const { data: claimed } = await supabase
        .from("entries")
        .update({ referee_notes: { scoring: true, claimedAt: new Date().toISOString() } })
        .eq("id", entry.id)
        .is("referee_score", null)
        .or(`referee_notes.is.null,referee_notes->>claimedAt.lt.${staleBefore}`)
        .select("id");
      if (!claimed || claimed.length === 0) continue;

      let verdict;
      try {
        verdict = await judgeEntry(brief, BrandKitSchema.parse(entry.kit));
      } catch (err) {
        await supabase.from("entries").update({ referee_notes: null }).eq("id", entry.id).is("referee_score", null);
        throw err;
      }

      await supabase
        .from("entries")
        .update({
          referee_pass: verdict.pass,
          referee_score: verdict.score,
          referee_notes: {
            reasons: verdict.reasons,
            deterministicReasons: verdict.deterministicReasons,
            criteria: verdict.criteria,
            minScore: verdict.minScore,
          },
        })
        .eq("id", entry.id);

      scored.push({
        agentKey: entry.agent_key ?? entry.agent_pubkey ?? "unknown",
        pass: verdict.pass,
        score: verdict.score,
      });
    }

    return NextResponse.json({ ok: true, scored });
  } catch (err) {
    return handleRouteError(err, "POST /api/bounties/[id]/referee");
  }
}
