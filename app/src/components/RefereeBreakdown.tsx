import { readCriteria, type CheckStatus } from "@/lib/agents/criteria";

const CHECK_STYLE: Record<CheckStatus, { icon: string; text: string; className: string }> = {
  met: { icon: "✓", text: "met", className: "text-accent" },
  partial: { icon: "~", text: "partly", className: "text-amber-700" },
  missing: { icon: "✗", text: "missing", className: "text-red-600" },
};

interface RefereeNotes {
  reasons?: string[];
  deterministicReasons?: string[];
  criteria?: unknown;
  minScore?: number;
}

/** The referee's per-criterion breakdown (score + one-line note each), the
 * buyer's pass mark, and any hard format problems. Reads both the current
 * per-brief criteria list and the older fixed 4-criteria shape. */
export function RefereeBreakdown({ notes }: { notes: unknown }) {
  const { reasons, deterministicReasons, criteria, minScore } = (notes ?? {}) as RefereeNotes;
  const items = readCriteria(criteria);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-stone-100/40 p-3 text-xs">
      {minScore !== undefined && (
        <p className="text-stone-500">Buyer&apos;s pass mark: {minScore}%</p>
      )}
      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((c, i) =>
            c.check ? (
              <div key={`${c.label}-${i}`}>
                <div className="flex items-start gap-2 text-stone-600">
                  <span className={`shrink-0 font-bold ${CHECK_STYLE[c.check].className}`}>
                    {CHECK_STYLE[c.check].icon}
                  </span>
                  <span className="break-words">{c.label.replace(/^Must-have: /, "")}</span>
                  <span className="ml-auto shrink-0 text-stone-500">{CHECK_STYLE[c.check].text}</span>
                </div>
                {c.note && <p className="mt-0.5 pl-5 text-stone-500">{c.note}</p>}
              </div>
            ) : (
              <div key={`${c.label}-${i}`}>
                <div className="mb-0.5 flex items-start justify-between gap-3 text-stone-600">
                  <span className="break-words">{c.label}</span>
                  <span className="shrink-0 font-mono text-stone-500">{c.score}/100</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-stone-200">
                  <div className="h-full rounded-full bg-accent/70" style={{ width: `${c.score}%` }} />
                </div>
                {c.note && <p className="mt-0.5 text-stone-500">{c.note}</p>}
              </div>
            ),
          )}
        </div>
      )}
      {deterministicReasons && deterministicReasons.length > 0 && (
        <div className="border-t border-stone-200 pt-2 text-red-600/80">
          {deterministicReasons.map((reason, i) => (
            <p key={i}>Format problem: {reason}</p>
          ))}
        </div>
      )}
      {reasons && reasons.length > 0 && (
        <div className={items.length > 0 ? "border-t border-stone-200 pt-2 text-stone-500" : "text-stone-500"}>
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
