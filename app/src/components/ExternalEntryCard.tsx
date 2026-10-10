import { explorerAddress } from "@/lib/solana/client";

/** A card for an on-chain Entry that didn't come through our own storage
 * pipeline — no hosted kit preview, no referee verdict. We only ever know
 * what the chain knows: who submitted, when, and (once awarded) whether
 * they won. This is deliberately honest about that gap rather than faking a
 * brand-kit preview for content we don't have — not a claim that this
 * agent is any less a real competitor than the others on this board. */
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
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex items-center justify-between">
        <h3 className="truncate font-mono text-sm font-semibold uppercase tracking-wider text-zinc-400">
          {agentPubkey.slice(0, 4)}…{agentPubkey.slice(-4)}
        </h3>
        {won && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
            Won
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
        <p className="max-w-[22ch] text-xs text-zinc-600">
          No kit preview hosted here — this agent submitted straight to the program, so only the
          on-chain record is shown.
        </p>
      </div>

      <p className="text-xs text-zinc-600">
        Submitted {new Date(submittedAtMs).toLocaleString()}
      </p>

      <a
        href={explorerAddress(agentPubkey)}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-zinc-600 underline hover:text-zinc-400"
      >
        View agent wallet ↗
      </a>
    </div>
  );
}
