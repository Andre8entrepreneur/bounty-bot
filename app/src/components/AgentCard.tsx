import type { EntryRow } from "@/lib/types";
import type { BrandKit } from "@/lib/agents/schema";
import { CRITERIA_KEYS, CRITERIA_LABELS, type CriterionResult } from "@/lib/agents/criteria";
import { personaLabel } from "@/lib/agents/display-names";
import { BrandBoard } from "./BrandBoard";

export function AgentCard({
  agentKey,
  entry,
  revealed,
}: {
  agentKey: string;
  entry: EntryRow | undefined;
  revealed: boolean;
}) {
  const label = personaLabel(agentKey);
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
            <RefereeBreakdown notes={entry.referee_notes} />
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

interface RefereeNotes {
  reasons?: string[];
  deterministicReasons?: string[];
  criteria?: Partial<Record<(typeof CRITERIA_KEYS)[number], CriterionResult>>;
}

/** Shows the referee's per-criterion breakdown (score + short note for each
 * of the 4 named criteria), falling back gracefully for older entries
 * scored before this breakdown existed (criteria absent -> just the overall
 * reasons list, as before). */
function RefereeBreakdown({ notes }: { notes: unknown }) {
  const { reasons, criteria } = (notes ?? {}) as RefereeNotes;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs">
      {criteria && (
        <div className="flex flex-col gap-2">
          {CRITERIA_KEYS.map((key) => {
            const c = criteria[key];
            if (!c) return null;
            return (
              <div key={key}>
                <div className="mb-0.5 flex items-center justify-between text-zinc-400">
                  <span>{CRITERIA_LABELS[key]}</span>
                  <span className="font-mono text-zinc-500">{c.score}/100</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-accent/70"
                    style={{ width: `${c.score}%` }}
                  />
                </div>
                <p className="mt-0.5 text-zinc-600">{c.note}</p>
              </div>
            );
          })}
        </div>
      )}
      {reasons && reasons.length > 0 && (
        <div className={criteria ? "mt-1 border-t border-zinc-800 pt-2 text-zinc-500" : "text-zinc-500"}>
          {reasons.map((reason, i) => (
            <p key={i} className="mb-1 last:mb-0">
              {reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
