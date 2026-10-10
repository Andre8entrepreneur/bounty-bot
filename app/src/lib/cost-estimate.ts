// What it costs an agent, in model tokens, to compete for a mission — priced
// on the flagship model of each major provider and compared to the payout.
// Client-safe: pure functions, no secrets, no I/O.

export interface ModelPrice {
  id: string;
  provider: string;
  name: string;
  /** USD per million tokens, standard tier, short context. */
  inputPerM: number;
  outputPerM: number;
  note?: string;
}

/** Each provider's most capable API model. Prices checked 2026-10-10 on the
 * providers' own pricing pages:
 * platform.claude.com/docs/en/about-claude/pricing,
 * developers.openai.com/api/docs/pricing, ai.google.dev/gemini-api/docs/pricing,
 * api-docs.deepseek.com/quick_start/pricing, docs.x.ai/docs/models,
 * platform.kimi.ai/docs/pricing/chat. */
export const MODEL_PRICES: readonly ModelPrice[] = [
  { id: "claude-fable-5-1", provider: "Anthropic", name: "Claude Fable 5.1", inputPerM: 10, outputPerM: 50 },
  { id: "gpt-6-astra", provider: "OpenAI", name: "GPT-6 Astra", inputPerM: 10, outputPerM: 50 },
  { id: "kimi-k3", provider: "Moonshot", name: "Kimi K3", inputPerM: 3, outputPerM: 15 },
  {
    id: "gemini-3.1-pro-preview",
    provider: "Google",
    name: "Gemini 3.1 Pro",
    inputPerM: 2,
    outputPerM: 12,
    note: "preview",
  },
  { id: "grok-4.7", provider: "xAI", name: "Grok 4.7", inputPerM: 2, outputPerM: 6 },
  {
    id: "deepseek-v4-pro",
    provider: "DeepSeek",
    name: "DeepSeek V4-Pro",
    inputPerM: 1.32,
    outputPerM: 3.96,
    note: "peak rate, half off-peak",
  },
  {
    id: "claude-opus-5-5",
    provider: "Anthropic",
    name: "Claude Opus 5.5",
    inputPerM: 4,
    outputPerM: 20,
    note: "runs our house agents",
  },
];

/** Measured token usage of one complete brand-kit run. */
export interface UsageSample {
  /** Input tokens minus the brief's own share: system prompt, output
   * contract, schema. Depends on the agent's persona, not the mission. */
  overheadTokens: number;
  outputTokens: number;
}

const seedRuns = (overheadTokens: number, outputs: number[]): UsageSample[] =>
  outputs.map((outputTokens) => ({ overheadTokens, outputTokens }));

/** 18 clean runs measured on 2026-10-10 with Claude Opus 5.5 — 6 per house
 * persona on the Lantern & Leaf demo brief (105 brief tokens), all first
 * attempt. Live runs recorded in agent_runs are added on top. */
export const SEED_SAMPLES: readonly UsageSample[] = [
  ...seedRuns(2501, [1186, 1244, 1108, 1143, 1191, 1291]), // minimal
  ...seedRuns(2467, [1620, 1972, 1826, 2113, 1570, 1434]), // bold
  ...seedRuns(2493, [1813, 1717, 1718, 1926, 1614, 1734]), // luxe
];

export interface Calibration {
  overheadTokens: number;
  outputTokens: number;
  /** How many measured runs this is based on. */
  runs: number;
}

/** Share of the prize an agent receives when it wins (the platform keeps 10%). */
export const WINNER_SHARE = 0.9;

/** Rough English/JSON average; good to ~±20% across providers' tokenizers. */
const CHARS_PER_TOKEN = 4;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function briefTokens(brief: unknown): number {
  return Math.ceil(JSON.stringify(brief ?? {}).length / CHARS_PER_TOKEN);
}

/** Median over the seed runs plus any live measurements. Medians, so one
 * odd run (a repair retry, a huge logo) doesn't swing the estimate. */
export function calibrate(live: readonly UsageSample[] = []): Calibration {
  const samples = [...SEED_SAMPLES, ...live];
  return {
    overheadTokens: median(samples.map((s) => s.overheadTokens)),
    outputTokens: median(samples.map((s) => s.outputTokens)),
    runs: samples.length,
  };
}

export const DEFAULT_CALIBRATION: Calibration = calibrate();

export interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
}

/** Tokens one agent spends producing one entry for this brief. */
export function estimateMissionTokens(brief: unknown, calibration: Calibration): TokenEstimate {
  return {
    inputTokens: calibration.overheadTokens + briefTokens(brief),
    outputTokens: calibration.outputTokens,
  };
}

export type Verdict = "worth-it" | "tight" | "skip";

/** Worth it: the run costs at most 10% of the payout (break even by winning
 * 1 mission in 10). Tight: up to 30%. Skip: more than that. */
export function verdictFor(costShare: number): Verdict {
  if (costShare <= 0.1) return "worth-it";
  if (costShare <= 0.3) return "tight";
  return "skip";
}

export interface ModelCost {
  model: ModelPrice;
  costUsd: number;
  /** costUsd / payout; also the win rate needed to break even. */
  costShare: number;
  verdict: Verdict;
}

export function costFor(tokens: TokenEstimate, model: ModelPrice): number {
  return (tokens.inputTokens * model.inputPerM + tokens.outputTokens * model.outputPerM) / 1_000_000;
}

/** Cost on every model, priced against the winner's payout (tUSDC counted
 * at $1). A missing or zero prize makes every run a "skip". */
export function estimateModelCosts(tokens: TokenEstimate, prizeTusdc: number | null): ModelCost[] {
  const payout = (prizeTusdc ?? 0) * WINNER_SHARE;
  return MODEL_PRICES.map((model) => {
    const costUsd = costFor(tokens, model);
    const costShare = payout > 0 ? costUsd / payout : Number.POSITIVE_INFINITY;
    return { model, costUsd, costShare, verdict: verdictFor(costShare) };
  });
}

export function formatUsd(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

export function formatShare(share: number): string {
  if (!Number.isFinite(share)) return "—";
  if (share < 0.001) return "<0.1%";
  return `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;
}

/** "1 in 450": how often an agent must win to cover its model bill. */
export function breakEvenLabel(share: number): string {
  if (!Number.isFinite(share)) return "never";
  if (share >= 1) return "can't — costs more than the payout";
  return `win 1 in ${Math.floor(1 / share).toLocaleString("en-US")}`;
}
