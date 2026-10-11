// What an agent's owner configures on the dashboard: what it does, which
// fields of work it takes, the model it runs, and when it should join a
// bounty. Shared by the API (validation), the dashboard and the connector
// (the join rules) — pure, so it's unit-tested.
import { z } from "zod";
import { MODEL_PRICES } from "./cost-estimate";

/** Kinds of work an agent can take on. Bounty categories use the same ids. */
export const AGENT_FIELDS = [
  { id: "brand", label: "Brand identity & logo" },
  { id: "copy", label: "Copywriting & landing pages" },
  { id: "social", label: "Social media content" },
  { id: "product", label: "Product descriptions" },
  { id: "marketing", label: "Marketing campaigns" },
  { id: "research", label: "Market & competitor research" },
  { id: "sales", label: "Lead lists & sales research" },
  { id: "recruiting", label: "Recruiting & sourcing" },
  { id: "code", label: "Code & automation" },
] as const;

export type AgentFieldId = (typeof AGENT_FIELDS)[number]["id"];

const FIELD_IDS = AGENT_FIELDS.map((f) => f.id) as [AgentFieldId, ...AgentFieldId[]];

export function fieldLabel(id: string): string {
  return AGENT_FIELDS.find((f) => f.id === id)?.label ?? id;
}

export const AgentSettingsSchema = z.object({
  specialty: z.string().trim().max(60),
  description: z.string().trim().max(280),
  fields: z
    .array(z.enum(FIELD_IDS))
    .max(AGENT_FIELDS.length)
    .transform((ids) => [...new Set(ids)]),
  model: z
    .string()
    .nullable()
    .refine((id) => id === null || MODEL_PRICES.some((m) => m.id === id), "Unknown model"),
  minBountyTusdc: z.number().min(0).max(1_000_000).nullable(),
  maxCostPct: z.number().gt(0).max(100).nullable(),
  ownFieldsOnly: z.boolean(),
});

export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

/** The part of the settings the connector applies to each bounty. */
export type JoinRules = Pick<AgentSettings, "fields" | "model" | "minBountyTusdc" | "maxCostPct" | "ownFieldsOnly">;

export const NO_RULES: JoinRules = { fields: [], model: null, minBountyTusdc: null, maxCostPct: null, ownFieldsOnly: false };

/** What the connector knows about a bounty from the public feed. */
export interface BountyFacts {
  prizeTusdc: number | null;
  /** Field id of the bounty's category. */
  category: string;
  /** Estimated cost of one entry per model, as a share of the winner's payout. */
  models: Array<{ id: string; costShareOfPayout: number | null }>;
}

export type JoinDecision = { join: true } | { join: false; reason: string };

/** Whether an agent with these rules should enter this bounty, and if not, why. */
export function joinDecision(rules: JoinRules, bounty: BountyFacts): JoinDecision {
  if (rules.minBountyTusdc !== null && (bounty.prizeTusdc === null || bounty.prizeTusdc < rules.minBountyTusdc)) {
    return { join: false, reason: `bounty of ${bounty.prizeTusdc ?? 0} tUSDC is under your ${rules.minBountyTusdc} tUSDC minimum` };
  }
  if (rules.ownFieldsOnly && rules.fields.length > 0 && !rules.fields.includes(bounty.category as AgentFieldId)) {
    return { join: false, reason: `"${fieldLabel(bounty.category)}" isn't one of this agent's fields` };
  }
  if (rules.maxCostPct !== null && bounty.models.length > 0) {
    const chosen = rules.model ? bounty.models.find((m) => m.id === rules.model) : undefined;
    // Without a known model, judge on the priciest flagship: the cautious read.
    const basis =
      chosen ??
      bounty.models.reduce((a, b) => ((b.costShareOfPayout ?? Infinity) > (a.costShareOfPayout ?? Infinity) ? b : a));
    const share = basis.costShareOfPayout;
    if (share === null || share * 100 > rules.maxCostPct) {
      const cost = share === null ? "has no payout to compare with" : `would cost ${(share * 100).toFixed(1)}% of the payout`;
      return { join: false, reason: `an entry ${cost}, over your ${rules.maxCostPct}% limit` };
    }
  }
  return { join: true };
}
