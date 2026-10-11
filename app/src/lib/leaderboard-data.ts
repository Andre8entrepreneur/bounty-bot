// Leaderboards for the /leaderboard page and the landing page. Read with the
// anon client (public SELECT only), like the rest of the public pages.
import { getSupabaseBrowserClient } from "./supabase/browser";
import { computeLeaderboard, leaderboardsByCategory, type AgentStats, type LeaderRow } from "./leaderboard";
import { PERSONA_SPECIALTIES, agentDisplayLabel } from "./agents/display-names";
import { categoryLabel } from "./agents/form-spec";

export interface Leaderboards {
  all: LeaderRow[];
  byCategory: Array<{ category: string; rows: LeaderRow[] }>;
}

export async function getLeaderboards(): Promise<Leaderboards> {
  const supabase = getSupabaseBrowserClient();
  const [{ data: entries }, { data: bounties }, { data: registry }] = await Promise.all([
    supabase.from("entries").select("agent_key,agent_pubkey,referee_score,referee_pass,bounty_id"),
    supabase.from("bounties").select("id,status,winner_agent,amount,brief"),
    supabase.from("agents").select("agent_pubkey,name,specialty").not("agent_pubkey", "is", null),
  ]);

  const leaderEntries = (entries ?? []).map((e) => ({
    agentKey: e.agent_key as string | null,
    agentPubkey: e.agent_pubkey as string | null,
    refereeScore: e.referee_score as number | null,
    refereePass: e.referee_pass as boolean | null,
    bountyId: e.bounty_id as string,
  }));
  const leaderBounties = (bounties ?? []).map((b) => ({
    id: b.id as string,
    status: b.status as string,
    winnerAgent: b.winner_agent as string | null,
    amount: b.amount as number | null,
    category: categoryLabel((b.brief as { category?: string } | null)?.category),
  }));

  const byPubkey = new Map(
    ((registry ?? []) as Array<{ agent_pubkey: string; name: string; specialty: string | null }>).map((a) => [
      a.agent_pubkey,
      a,
    ]),
  );
  const named = (stats: AgentStats[]): LeaderRow[] =>
    stats.map((s) => {
      const reg = byPubkey.get(s.id);
      return {
        ...s,
        name: reg?.name ?? agentDisplayLabel(s.agentKey ?? s.id),
        specialty: reg?.specialty ?? (s.agentKey ? (PERSONA_SPECIALTIES[s.agentKey] ?? null) : null),
      };
    });

  return {
    all: named(computeLeaderboard(leaderEntries, leaderBounties)),
    byCategory: leaderboardsByCategory(leaderEntries, leaderBounties).map((b) => ({
      category: b.category,
      rows: named(b.stats),
    })),
  };
}
