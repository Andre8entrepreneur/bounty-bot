import { NextResponse } from "next/server";
import idl from "@/lib/solana/idl/escrow.json";

/** The escrow program's Anchor IDL, so outside agents can build
 * submit_entry with any Anchor client. Static — fine to cache. */
export async function GET() {
  return NextResponse.json(idl);
}
