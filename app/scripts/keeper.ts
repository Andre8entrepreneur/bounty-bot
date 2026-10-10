// Platform keeper. The referee and settlement are triggered by the bounty
// page's own timers, so a bounty whose page nobody had open at the deadline
// never gets scored or settled — it stays "open" forever with the prize
// locked in escrow. Every 30s this calls the same idempotent endpoints the
// page would: /referee once after the deadline, then /settle + /sync once the
// pick window is over (which refunds the buyer if they never picked).
//
// Usage:
//   npx tsx scripts/keeper.ts --once     # one sweep (cleans up stale bounties)
//   npx tsx scripts/keeper.ts            # forever (npm run keeper:start)
import { config } from "dotenv";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv, getServerEnv } from "../src/lib/env";

config({ path: resolve(process.cwd(), ".env.local"), override: true });

const BASE_URL = "https://bounty-bot-andre-qian.vercel.app";
const SWEEP_MS = 30_000;

async function post(path: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST" });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

async function main(): Promise<void> {
  if (getPublicEnv().NEXT_PUBLIC_CLUSTER !== "devnet") {
    console.error("keeper refuses to run: NEXT_PUBLIC_CLUSTER is not \"devnet\".");
    process.exit(1);
  }
  const once = process.argv.includes("--once");
  const supabase = createClient(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SERVICE_ROLE_KEY);
  const refereed = new Set<string>();
  const stamp = () => new Date().toLocaleTimeString();

  console.log(`[${stamp()}] keeper ${once ? "running one sweep" : "running every 30s"}`);

  for (;;) {
    try {
      const now = new Date();
      const { data } = await supabase
        .from("bounties")
        .select("id,deadline,pick_deadline")
        .eq("status", "open")
        .lt("deadline", now.toISOString())
        .returns<Array<{ id: string; deadline: string; pick_deadline: string }>>();

      for (const b of data ?? []) {
        const short = b.id.slice(0, 8);
        if (!refereed.has(b.id)) {
          const ref = await post(`/api/bounties/${b.id}/referee`);
          if (ref.status === 200) {
            refereed.add(b.id);
            const scored = Array.isArray(ref.json.scored) ? ref.json.scored.length : 0;
            if (scored > 0) console.log(`[${stamp()}] ${short}: referee scored ${scored}`);
          } else {
            console.log(`[${stamp()}] ${short}: referee ${ref.status} ${JSON.stringify(ref.json)}`);
          }
        }
        if (new Date(b.pick_deadline).getTime() < now.getTime()) {
          const settle = await post(`/api/bounties/${b.id}/settle`);
          await post(`/api/bounties/${b.id}/sync`);
          console.log(`[${stamp()}] ${short}: settle ${settle.status} ${JSON.stringify(settle.json)}`);
        }
      }
    } catch (err) {
      console.log(`[${stamp()}] sweep error (will retry): ${err instanceof Error ? err.message : String(err)}`);
    }
    if (once) return;
    await new Promise((r) => setTimeout(r, SWEEP_MS));
  }
}

main().catch((err) => {
  console.error("keeper FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
