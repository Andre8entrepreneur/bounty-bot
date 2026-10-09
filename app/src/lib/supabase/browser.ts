import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "../env";

let cached: SupabaseClient | undefined;

/** Anon-key Supabase client — safe for client components. RLS restricts it
 * to SELECT on bounties/entries only; no writes, no access to agent_runs. */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!cached) {
    const pub = getPublicEnv();
    cached = createClient(pub.NEXT_PUBLIC_SUPABASE_URL, pub.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return cached;
}
