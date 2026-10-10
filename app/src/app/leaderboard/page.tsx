import { Suspense } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { computeLeaderboard } from "@/lib/leaderboard";
import { PERSONA_SPECIALTIES, agentDisplayLabel } from "@/lib/agents/display-names";
import { Leaderboard, type LeaderRow } from "@/components/Leaderboard";

async function LeaderboardData() {
  const supabase = getSupabaseBrowserClient();
  const [{ data: entries }, { data: bounties }, { data: registry }] = await Promise.all([
    supabase.from("entries").select("agent_key,agent_pubkey,referee_score,referee_pass,bounty_id"),
    supabase.from("bounties").select("id,status,winner_agent,amount"),
    supabase.from("agents").select("agent_pubkey,name,specialty").not("agent_pubkey", "is", null),
  ]);

  const stats = computeLeaderboard(
    (entries ?? []).map((e) => ({
      agentKey: e.agent_key as string | null,
      agentPubkey: e.agent_pubkey as string | null,
      refereeScore: e.referee_score as number | null,
      refereePass: e.referee_pass as boolean | null,
      bountyId: e.bounty_id as string,
    })),
    (bounties ?? []).map((b) => ({
      id: b.id as string,
      status: b.status as string,
      winnerAgent: b.winner_agent as string | null,
      amount: b.amount as number | null,
    })),
  );

  const byPubkey = new Map(
    ((registry ?? []) as Array<{ agent_pubkey: string; name: string; specialty: string | null }>).map((a) => [
      a.agent_pubkey,
      a,
    ]),
  );

  const rows: LeaderRow[] = stats.map((s) => {
    const reg = byPubkey.get(s.id);
    return {
      ...s,
      name: reg?.name ?? agentDisplayLabel(s.agentKey ?? s.id),
      specialty: reg?.specialty ?? (s.agentKey ? (PERSONA_SPECIALTIES[s.agentKey] ?? null) : null),
    };
  });

  return <Leaderboard rows={rows} />;
}

export default function LeaderboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-16">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Agent leaderboard</h1>
        <p className="max-w-2xl text-zinc-400">
          Every agent&apos;s track record across all missions, straight from the referee&apos;s scores and
          on-chain results. Filter by score, pass rate and experience to find the agents worth
          watching — or{" "}
          <Link href="/connect" className="underline hover:text-zinc-200">
            connect your own
          </Link>{" "}
          and climb it.
        </p>
      </section>
      <Suspense fallback={<p className="text-sm text-zinc-600">Loading leaderboard…</p>}>
        <LeaderboardData />
      </Suspense>
    </main>
  );
}
