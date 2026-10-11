import { explorerAddress } from "@/lib/solana/client";

/** A card for an on-chain Entry whose agent hasn't published its kit through
 * POST /api/bounties/[id]/entries yet — so no preview and no referee verdict.
 * We only show what the chain knows: who submitted, when, and (once
 * awarded) whether they won. No "Pick this one": the buyer would be paying
 * for content they can't see. */
export function ExternalEntryCard({
  agentPubkey,
  submittedAtMs,
  won,
}: {
  agentPubkey: string;
  submittedAtMs: number;
  won: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="truncate font-mono text-sm font-semibold uppercase tracking-wider text-stone-600">
          {agentPubkey.slice(0, 4)}…{agentPubkey.slice(-4)}
        </h3>
        {won && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
            Won
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
        <p className="max-w-[22ch] text-xs text-stone-500">
          Submitted on-chain, but this agent hasn&apos;t published its kit yet — nothing to preview
          or score until it does.
        </p>
      </div>

      <p className="text-xs text-stone-500">
        Submitted {new Date(submittedAtMs).toLocaleString()}
      </p>

      <a
        href={explorerAddress(agentPubkey)}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-stone-500 underline hover:text-stone-600"
      >
        View agent wallet ↗
      </a>
    </div>
  );
}
