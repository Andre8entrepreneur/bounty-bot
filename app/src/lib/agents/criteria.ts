// Shared referee-criteria logic/types — no server-only imports (no Anthropic
// SDK, no env access), so this is safe to import from both server code
// (referee.ts) and client components. Keeping referee.ts's Anthropic SDK
// import out of the client bundle is the whole reason this file exists.
import { z } from "zod";
import type { Brief } from "./schema";

export const CriterionScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  note: z.string().min(1).max(240),
});

export const CHECK_STATUSES = ["met", "partial", "missing"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

/** Must-haves are classified, not scored: asked for a 0-100 score, the judge
 * hedges ("met only on a technicality") and lets the kit's overall quality
 * leak in. A classification is a factual call; the score is derived here. */
export const CriterionCheckSchema = z.object({
  status: z.enum(CHECK_STATUSES),
  note: z.string().min(1).max(240),
});

export const CHECK_SCORES: Record<CheckStatus, number> = { met: 100, partial: 50, missing: 0 };

/** One scored criterion as stored in entries.referee_notes.criteria. */
export interface CriterionResult {
  label: string;
  score: number;
  note: string;
  /** Present for must-have items. */
  check?: CheckStatus;
}

export interface CriterionSpec {
  label: string;
  /** "score" = graded 0-100; "check" = must-have, classified met/partial/missing. */
  kind: "score" | "check";
  /** What the judge checks — derived only from what the buyer wrote. */
  check: string;
}

/** The criteria a kit is judged on, built only from what the buyer wrote in
 * the brief — never a subjective dimension they didn't ask for. Inspiration
 * is deliberately absent: it's optional for agents, so it's never scored. */
export function buildCriteria(brief: Brief): CriterionSpec[] {
  const specs: CriterionSpec[] = [
    {
      label: "Fits the brief",
      kind: "score",
      check:
        "how well the kit matches what the business does, its audience, the vibe keywords, and the buyer's own answers in details (if any)",
    },
  ];
  if (brief.visualDirection || (brief.colors && brief.colors.length > 0)) {
    specs.push({
      label: "Matches the look & feel",
      kind: "score",
      check: "how closely the kit follows the buyer's visualDirection and requested colors",
    });
  }
  if (brief.avoid) {
    specs.push({
      label: "Avoids what was excluded",
      kind: "score",
      check: "the kit contains nothing from the buyer's avoid list (score very low on any violation)",
    });
  }
  (brief.mustHaves ?? []).forEach((item, i) => {
    specs.push({
      label: `Must-have: ${item}`,
      kind: "check",
      check: `is must-have item #${i + 1} (mustHaves[${i}] in the brief) present in the kit?`,
    });
  });
  return specs;
}

/** Labels for entries scored before criteria came from the brief, so their
 * stored breakdowns still render. */
export const LEGACY_CRITERIA_LABELS: Record<string, string> = {
  briefFit: "Brief fit",
  constraintCompliance: "Constraint compliance",
  coherence: "Coherence",
  distinctiveness: "Distinctiveness",
};

/** Normalizes stored referee_notes.criteria (new array shape, or the legacy
 * object keyed by criterion) into a list for display. */
export function readCriteria(raw: unknown): CriterionResult[] {
  if (Array.isArray(raw)) {
    return raw.filter(
      (c): c is CriterionResult =>
        typeof c === "object" && c !== null && typeof c.label === "string" && typeof c.score === "number",
    );
  }
  // Legacy shape: { briefFit: { score, note }, ... }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, { score?: number; note?: string }>)
      .filter(([, c]) => typeof c?.score === "number")
      .map(([key, c]) => ({
        label: LEGACY_CRITERIA_LABELS[key] ?? key,
        score: c.score as number,
        note: c.note ?? "",
      }));
  }
  return [];
}
