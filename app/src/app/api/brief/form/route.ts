import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionPubkey } from "@/lib/auth/session";
import { generateFormSpec } from "@/lib/agents/brief-assist";
import {
  InterviewTurnSchema,
  MAX_INTERVIEW_TURNS,
  MIN_INTERVIEW_TURNS,
  WORK_CATEGORIES,
} from "@/lib/agents/form-spec";
import { checkRateLimit } from "@/lib/rate-limit";
import { handleRouteError, jsonError } from "@/lib/api-error";

export const maxDuration = 90;

const BodySchema = z.object({
  category: z.string().min(1).max(40),
  turns: z.array(InterviewTurnSchema).min(MIN_INTERVIEW_TURNS).max(MAX_INTERVIEW_TURNS),
});

/** Builds the form for this mission from the interview. Signed-in wallets
 * only, rate-limited per wallet. */
export async function POST(request: Request) {
  const owner = getSessionPubkey(request);
  if (!owner) return jsonError(401, "Sign in first");
  if (!checkRateLimit(`briefform:${owner}`, 4)) return jsonError(429, "Too many requests — slow down a little");

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return jsonError(400, "Invalid request body");
  }
  const category = WORK_CATEGORIES.find((c) => c.id === body.category);
  if (!category?.available) return jsonError(400, "This kind of work isn't available yet");

  try {
    const spec = await generateFormSpec(category.label, body.turns);
    return NextResponse.json({ spec, category: category.label });
  } catch (err) {
    return handleRouteError(err, "POST /api/brief/form");
  }
}
