import "server-only";
import { NextResponse } from "next/server";

/** A JSON error response with no stack trace ever reaching the client. */
export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Logs the real error server-side and returns a generic client-safe one. */
export function handleRouteError(err: unknown, context: string): NextResponse {
  console.error(`[${context}]`, err);
  return jsonError(500, "Internal server error");
}
