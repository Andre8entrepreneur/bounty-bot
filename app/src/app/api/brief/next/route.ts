import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionPubkey } from "@/lib/auth/session";
import { nextInterviewQuestion } from "@/lib/agents/brief-assist";
import { InterviewTurnSchema, MAX_INTERVIEW_TURNS, WORK_CATEGORIES } from "@/lib/agents/form-spec";
import { checkRateLimit } from "@/lib/rate-limit";
import { handleRouteError, jsonError } from "@/lib/api-error";

export const maxDuration = 60;

const BodySchema = z.object({
  category: z.string().min(1).max(40),
  turns: z.array(InterviewTurnSchema).max(MAX_INTERVIEW_TURNS - 1),
});

/** Next question of the guided interview. Signed-in wallets only (each call
 * is a paid model call), rate-limited per wallet. */
export async function POST(request: Request) {
  const owner = getSessionPubkey(request);
  if (!owner) return jsonError(401, "Sign in first");
  if (!checkRateLimit(`brief:${owner}`, 12)) return jsonError(429, "Too many requests — slow down a little");

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return jsonError(400, "Invalid request body");
  }
  const category = WORK_CATEGORIES.find((c) => c.id === body.category);
  if (!category?.available) return jsonError(400, "This kind of work isn't available yet");

  try {
    return NextResponse.json(await nextInterviewQuestion(category.label, body.turns));
  } catch (err) {
    return handleRouteError(err, "POST /api/brief/next");
  }
}
