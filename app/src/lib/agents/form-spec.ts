// The guided-brief contract, shared by the browser and the server (no
// server-only imports). An interview that narrows from a broad category to
// specifics, then a form generated for THIS mission: tailored wording for the
// core brief fields every agent needs, suggestions the buyer can tap, and
// niche-specific extra questions whose answers travel as brief.details.
import { z } from "zod";
import { VIBE_ALLOWLIST } from "./schema";

export interface WorkCategory {
  id: string;
  label: string;
  /** Only categories our agents and referee can deliver today. */
  available: boolean;
}

export const WORK_CATEGORIES: WorkCategory[] = [
  { id: "brand", label: "Brand identity & logo", available: true },
  { id: "copy", label: "Website & landing page copy", available: false },
  { id: "social", label: "Social media content", available: false },
  { id: "product", label: "Product descriptions", available: false },
  { id: "research", label: "Market research", available: false },
  { id: "code", label: "Code & automation", available: false },
];

/** Display label for a bounty's category. Bounties posted before categories
 * existed are all brand identity bounties. */
export function categoryLabel(category: string | undefined | null): string {
  const known = WORK_CATEGORIES.find((c) => c.id === category || c.label === category);
  return (known ?? WORK_CATEGORIES[0]).label;
}

/** Field id of a bounty's category (the ids agents pick their fields from). */
export function categoryId(category: string | undefined | null): string {
  const known = WORK_CATEGORIES.find((c) => c.id === category || c.label === category);
  return (known ?? WORK_CATEGORIES[0]).id;
}

export const MAX_INTERVIEW_TURNS = 4;
export const MIN_INTERVIEW_TURNS = 2;

export const InterviewTurnSchema = z.object({
  question: z.string().trim().min(1).max(200),
  answer: z.string().trim().min(1).max(400),
});
export type InterviewTurn = z.infer<typeof InterviewTurnSchema>;

export const NextQuestionSchema = z.object({
  question: z.string().min(5).max(200),
  suggestions: z.array(z.string().min(1).max(80)).max(5),
  /** The model thinks it knows enough to build the form. */
  done: z.boolean(),
});
export type NextQuestion = z.infer<typeof NextQuestionSchema>;

const FieldCopy = z.object({
  label: z.string().min(2).max(80),
  placeholder: z.string().max(160),
});
const FieldCopyWithHelp = FieldCopy.extend({ help: z.string().max(200) });

export const ExtraFieldSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{2,40}$/),
  label: z.string().min(3).max(120),
  help: z.string().max(200),
  kind: z.enum(["text", "longtext", "choice", "multichoice"]),
  /** For choice / multichoice; empty for text kinds. */
  options: z.array(z.string().min(1).max(60)).max(6),
  placeholder: z.string().max(160),
});
export type ExtraField = z.infer<typeof ExtraFieldSchema>;

export const FormSpecSchema = z.object({
  title: z.string().min(3).max(100),
  intro: z.string().max(260),
  core: z.object({
    businessName: FieldCopy,
    whatItDoes: FieldCopyWithHelp,
    audience: FieldCopyWithHelp,
    avoid: FieldCopy,
    visualDirection: FieldCopy,
    inspiration: FieldCopy,
  }),
  suggestedVibes: z.array(z.enum(VIBE_ALLOWLIST)).max(5),
  suggestedMustHaves: z.array(z.string().min(2).max(120)).max(6),
  extraFields: z.array(ExtraFieldSchema).min(2).max(6),
});
export type FormSpec = z.infer<typeof FormSpecSchema>;
