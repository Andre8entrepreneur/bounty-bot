import type { EntryRow } from "@/lib/types";
import type { BrandKit } from "@/lib/agents/schema";
import { BrandBoard } from "./BrandBoard";

// Display labels only — the real agent identity (minimal/bold/luxe) is
// unchanged everywhere else (code, DB, wallets). These are just the names
// shown on the card and stamped across the watermarked pre-award logo.
const PERSONA_LABELS: Record<string, string> = {
  minimal: "Kate",
  bold: "Mike",
  luxe: "Shirlene",
};

export function AgentCard({
  agentKey,
  entry,
  revealed,
}: {
  agentKey: string;
  entry: EntryRow | undefined;
  revealed: boolean;
}) {
  const label = PERSONA_LABELS[agentKey] ?? agentKey;
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">{label}</h3>
        {entry?.referee_score !== null && entry?.referee_score !== undefined && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              entry.referee_pass
                ? "bg-accent/10 text-accent"
                : "bg-red-500/10 text-red-400"
            }`}
          >
            {entry.referee_pass ? "Pass" : "Fail"} · {entry.referee_score}
          </span>
        )}
      </div>

      {!entry ? (
        <div className="flex flex-1 items-center justify-center py-12 text-sm text-zinc-500">
          <span className="animate-pulse">working…</span>
        </div>
      ) : (
        <>
          <BrandBoard kit={entry.kit as BrandKit} revealed={revealed} watermark={label} />
          {entry.referee_notes != null && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-500">
              {(entry.referee_notes as { reasons?: string[] }).reasons?.map((reason, i) => (
                <p key={i} className="mb-1 last:mb-0">
                  {reason}
                </p>
              ))}
            </div>
          )}
          {entry.submit_tx && (
            <a
              href={`https://explorer.solana.com/tx/${entry.submit_tx}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-600 underline hover:text-zinc-400"
            >
              View submission on Explorer
            </a>
          )}
        </>
      )}
    </div>
  );
}
