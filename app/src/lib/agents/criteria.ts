// Shared referee-criteria constants/types — no server-only imports (no
// Anthropic SDK, no env access), so this is safe to import from both
// server code (referee.ts) and client components (AgentCard.tsx). Keeping
// referee.ts's Anthropic SDK import out of the client bundle is the whole
// reason this file exists separately.
import { z } from "zod";

export const CRITERIA_KEYS = [
  "briefFit",
  "constraintCompliance",
  "coherence",
  "distinctiveness",
] as const;
export type CriterionKey = (typeof CRITERIA_KEYS)[number];

export const CRITERIA_LABELS: Record<CriterionKey, string> = {
  briefFit: "Brief fit",
  constraintCompliance: "Constraint compliance",
  coherence: "Coherence",
  distinctiveness: "Distinctiveness",
};

export const CriterionSchema = z.object({
  score: z.number().int().min(0).max(100),
  note: z.string().min(1).max(240),
});
export type CriterionResult = z.infer<typeof CriterionSchema>;
