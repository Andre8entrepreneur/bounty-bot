import {
  WINNER_SHARE,
  breakEvenLabel,
  estimateMissionTokens,
  estimateModelCosts,
  formatShare,
  formatUsd,
  type Calibration,
  type Verdict,
} from "@/lib/cost-estimate";

const VERDICT: Record<Verdict, { label: string; className: string }> = {
  "worth-it": { label: "Worth it", className: "bg-accent/10 text-accent" },
  tight: { label: "Tight", className: "bg-amber-400/10 text-amber-700" },
  skip: { label: "Skip", className: "bg-red-500/10 text-red-600" },
};

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function computeEstimate(brief: unknown, prizeTusdc: number | null, calibration: Calibration) {
  const tokens = estimateMissionTokens(brief, calibration);
  const costs = estimateModelCosts(tokens, prizeTusdc);
  const payout = prizeTusdc !== null ? prizeTusdc * WINNER_SHARE : null;
  return { tokens, costs, payout };
}

/** One line for a mission card: cost range across models vs the payout. */
export function MissionCostSummary({
  brief,
  prizeTusdc,
  calibration,
}: {
  brief: unknown;
  prizeTusdc: number | null;
  calibration: Calibration;
}) {
  const { tokens, costs, payout } = computeEstimate(brief, prizeTusdc, calibration);
  const cheapest = costs.reduce((a, b) => (b.costUsd < a.costUsd ? b : a));
  const priciest = costs.reduce((a, b) => (b.costUsd > a.costUsd ? b : a));
  const worth = costs.filter((c) => c.verdict === "worth-it").length;
  const overall: Verdict = worth === costs.length ? "worth-it" : worth > 0 ? "tight" : "skip";

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-stone-200 bg-stone-100/40 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-stone-600">
          Agent cost {formatUsd(cheapest.costUsd)}–{formatUsd(priciest.costUsd)}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${VERDICT[overall].className}`}>
          {overall === "tight" ? `Worth it on ${worth}/${costs.length} models` : VERDICT[overall].label}
        </span>
      </div>
      <span className="text-stone-500">
        ~{formatTokens(tokens.inputTokens + tokens.outputTokens)} tokens per entry
        {payout !== null && ` · ≤${formatShare(priciest.costShare)} of the ${payout.toLocaleString("en-US")} tUSDC payout`}
      </span>
    </div>
  );
}

/** Full breakdown: every flagship model, its cost, share of payout, and the
 * win rate it needs to break even. */
export function MissionCostTable({
  brief,
  prizeTusdc,
  calibration,
}: {
  brief: unknown;
  prizeTusdc: number | null;
  calibration: Calibration;
}) {
  const { tokens, costs, payout } = computeEstimate(brief, prizeTusdc, calibration);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-stone-600">
        One entry takes about{" "}
        <span className="text-stone-800">{tokens.inputTokens.toLocaleString("en-US")} input</span> +{" "}
        <span className="text-stone-800">{tokens.outputTokens.toLocaleString("en-US")} output tokens</span>
        {payout !== null && (
          <>
            {" "}
            — the winner receives <span className="text-stone-800">{payout.toLocaleString("en-US")} tUSDC</span>
          </>
        )}
        .
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-xs">
          <thead className="text-stone-500">
            <tr className="border-b border-stone-200">
              <th className="py-2 pr-3 font-normal">Model</th>
              <th className="py-2 pr-3 text-right font-normal">Cost / entry</th>
              <th className="py-2 pr-3 text-right font-normal">Of payout</th>
              <th className="py-2 pr-3 font-normal">Break even</th>
              <th className="py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {costs.map((c) => (
              <tr key={c.model.id} className="border-b border-stone-100">
                <td className="py-2 pr-3">
                  <span className="text-stone-800">{c.model.name}</span>
                  <span className="text-stone-500">
                    {" "}
                    · {c.model.provider}
                    {c.model.note && ` · ${c.model.note}`}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-800">{formatUsd(c.costUsd)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-600">{formatShare(c.costShare)}</td>
                <td className="py-2 pr-3 text-stone-600">{breakEvenLabel(c.costShare)}</td>
                <td className="py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${VERDICT[c.verdict].className}`}>
                    {VERDICT[c.verdict].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500">
        Based on {calibration.runs} measured agent runs; list prices per provider, checked Oct 10, 2026. Each
        provider counts tokens a little differently (±20%), reasoning models can bill extra thinking tokens,
        and a repair retry doubles the cost. Worth it = at most 10% of the payout; tight = up to 30%. tUSDC
        counted at $1.
      </p>
    </div>
  );
}
