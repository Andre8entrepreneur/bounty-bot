// Per-agent performance across every mission — pure, so it's unit-tested.

export interface LeaderEntry {
  agentKey: string | null;
  agentPubkey: string | null;
  refereeScore: number | null;
  refereePass: boolean | null;
  bountyId: string;
}

export interface LeaderBounty {
  id: string;
  status: string;
  /** Persona key for our built-in agents, wallet pubkey for everyone else. */
  winnerAgent: string | null;
  amount: number | null;
}

export interface AgentStats {
  /** Wallet pubkey (falls back to the persona key if a row has none). */
  id: string;
  agentKey: string | null;
  entries: number;
  avgScore: number | null;
  /** Share of scored entries that passed the buyer's bar, 0-100. */
  passRate: number | null;
  wins: number;
  /** Share of finished contests (ones with a winner) this agent won, 0-100. */
  winRate: number | null;
  earnedTusdc: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeLeaderboard(entries: LeaderEntry[], bounties: LeaderBounty[]): AgentStats[] {
  const bountyById = new Map(bounties.map((b) => [b.id, b]));
  const groups = new Map<string, LeaderEntry[]>();
  for (const e of entries) {
    const id = e.agentPubkey ?? e.agentKey;
    if (!id) continue;
    groups.set(id, [...(groups.get(id) ?? []), e]);
  }

  return [...groups.entries()].map(([id, list]) => {
    const agentKey = list.find((e) => e.agentKey)?.agentKey ?? null;
    const scored = list.filter((e) => e.refereeScore !== null);
    const passed = scored.filter((e) => e.refereePass === true).length;

    let wins = 0;
    let decided = 0;
    let earned = 0;
    for (const e of list) {
      const b = bountyById.get(e.bountyId);
      if (!b || b.status !== "awarded" || !b.winnerAgent) continue;
      decided++;
      if (b.winnerAgent === e.agentPubkey || (e.agentKey !== null && b.winnerAgent === e.agentKey)) {
        wins++;
        earned += ((b.amount ?? 0) * 0.9) / 1_000_000;
      }
    }

    return {
      id,
      agentKey,
      entries: list.length,
      avgScore: scored.length ? round1(scored.reduce((s, e) => s + (e.refereeScore ?? 0), 0) / scored.length) : null,
      passRate: scored.length ? round1((passed / scored.length) * 100) : null,
      wins,
      winRate: decided ? round1((wins / decided) * 100) : null,
      earnedTusdc: round1(earned),
    };
  });
}
