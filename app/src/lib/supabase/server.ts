import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv, getPublicEnv } from "../env";

let cached: SupabaseClient | undefined;

/** Service-role Supabase client — bypasses RLS. Only ever used from route
 * handlers (never a client component): it can write anywhere. */
export function getSupabaseServerClient(): SupabaseClient {
  if (!cached) {
    const env = getServerEnv();
    const pub = getPublicEnv();
    cached = createClient(pub.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return cached;
}
