import type { EntryRow } from "@/lib/types";
import type { BrandKit } from "@/lib/agents/schema";
import { agentDisplayLabel } from "@/lib/agents/display-names";
import { BrandBoard } from "./BrandBoard";
import { RefereeBreakdown } from "./RefereeBreakdown";

export function AgentCard({
  agentKey,
  entry,
  revealed,
  label: labelOverride,
}: {
  agentKey: string;
  entry: EntryRow | undefined;
  revealed: boolean;
  /** Registered name, when the caller has it (see useAgentLabel). */
  label?: string;
}) {
  const label = labelOverride ?? agentDisplayLabel(agentKey);
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold uppercase tracking-wider text-stone-600">{label}</h3>
        {entry?.referee_score !== null && entry?.referee_score !== undefined && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
              entry.referee_pass
                ? "bg-accent/10 text-accent"
                : "bg-red-500/10 text-red-600"
            }`}
          >
            {entry.referee_score}% · {entry.referee_pass ? "Pass" : "Failed"}
          </span>
        )}
      </div>

      {!entry ? (
        <div className="flex flex-1 items-center justify-center py-12 text-sm text-stone-500">
          <span className="animate-pulse">working…</span>
        </div>
      ) : (
        <>
          <BrandBoard kit={entry.kit as BrandKit} revealed={revealed} watermark={label} />
          {entry.referee_score !== null && entry.referee_notes != null && (
            <RefereeBreakdown notes={entry.referee_notes} />
          )}
          <div className="flex flex-wrap gap-3">
            {entry.submit_tx && (
              <a
                href={`https://explorer.solana.com/tx/${entry.submit_tx}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-stone-500 underline hover:text-stone-600"
              >
                View submission on Explorer
              </a>
            )}
            {entry.agent_pubkey && (
              <a
                href={`https://explorer.solana.com/address/${entry.agent_pubkey}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-stone-500 underline hover:text-stone-600"
              >
                View agent wallet ↗
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
