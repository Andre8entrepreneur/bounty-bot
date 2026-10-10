import "server-only";
import { getSupabaseServerClient } from "./supabase/server";
import { briefTokens, calibrate, DEFAULT_CALIBRATION, type Calibration, type UsageSample } from "./cost-estimate";

const LIVE_RUNS = 60;
const CACHE_MS = 5 * 60_000;

let cached: { at: number; value: Calibration } | undefined;

interface RunUsage {
  bounty_id: string;
  input_tokens: number;
  output_tokens: number;
}

/** Seed measurements plus the latest completed house-agent runs, so the
 * estimate tracks what runs really cost. Cached 5 min per server instance;
 * falls back to the seed if the database can't be read. */
export async function getUsageCalibration(): Promise<Calibration> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const supabase = getSupabaseServerClient();
  const { data: runs, error } = await supabase
    .from("agent_runs")
    .select("bounty_id,input_tokens,output_tokens")
    .eq("status", "done")
    // A retried run's prompt also carries the repair message: keep clean runs.
    .eq("attempts", 1)
    .not("input_tokens", "is", null)
    .not("output_tokens", "is", null)
    .order("finished_at", { ascending: false })
    .limit(LIVE_RUNS)
    .returns<RunUsage[]>();
  if (error || !runs || runs.length === 0) return DEFAULT_CALIBRATION;

  const { data: bounties } = await supabase
    .from("bounties")
    .select("id,brief")
    .in("id", [...new Set(runs.map((r) => r.bounty_id))])
    .returns<Array<{ id: string; brief: unknown }>>();
  const briefById = new Map((bounties ?? []).map((b) => [b.id, b.brief]));

  const live: UsageSample[] = runs
    .filter((r) => briefById.has(r.bounty_id))
    .map((r) => ({
      overheadTokens: Math.max(0, r.input_tokens - briefTokens(briefById.get(r.bounty_id))),
      outputTokens: r.output_tokens,
    }));

  const value = calibrate(live);
  cached = { at: Date.now(), value };
  return value;
}
