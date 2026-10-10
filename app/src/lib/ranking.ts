import type { EntryRow } from "./types";

/** One competitor on a bounty. `key` is the persona key for our agents and
 * the wallet pubkey for everyone else — the same value settle/sync store in
 * bounties.winner_agent. */
export interface RankRow {
  key: string;
  /** Published kit (ours or an outside agent's). */
  entry?: EntryRow;
  /** Outside agent that submitted on-chain but hasn't published its kit. */
  unpublishedAtMs?: number;
}

export type RowState = "scored" | "awaiting" | "unpublished" | "working";

export function rowState(row: RankRow): RowState {
  if (row.entry?.referee_score != null) return "scored";
  if (row.entry) return "awaiting";
  if (row.unpublishedAtMs !== undefined) return "unpublished";
  return "working";
}

const STATE_ORDER: Record<RowState, number> = { scored: 0, awaiting: 1, unpublished: 2, working: 3 };

function submittedAt(row: RankRow): number {
  if (row.entry) return new Date(row.entry.created_at).getTime();
  return row.unpublishedAtMs ?? Number.POSITIVE_INFINITY;
}

/** Best score first; then submitted-but-unscored, then on-chain-only, then
 * agents still working — each of those groups in submission order. */
export function rankRows(rows: RankRow[]): RankRow[] {
  return [...rows].sort((a, b) => {
    const sa = rowState(a);
    const sb = rowState(b);
    if (sa !== sb) return STATE_ORDER[sa] - STATE_ORDER[sb];
    if (sa === "scored") {
      const diff = (b.entry?.referee_score ?? 0) - (a.entry?.referee_score ?? 0);
      if (diff !== 0) return diff;
    }
    return submittedAt(a) - submittedAt(b);
  });
}
