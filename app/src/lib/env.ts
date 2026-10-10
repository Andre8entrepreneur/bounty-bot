import { z } from "zod";

// An optional env var that's present-but-empty (e.g. `KEYS_DIR=` in
// .env.local) must be treated the same as absent — plain `.optional()` only
// catches a genuinely missing key, not an empty string.
function optionalString() {
  return z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional());
}

// Server-side secrets. Only ever import `serverEnv` from server-only code
// (route handlers, server components, scripts) — never from a client component.
// Next.js only inlines `NEXT_PUBLIC_*` vars into the browser bundle, so these
// values are structurally absent from client code regardless.
const serverSchema = z
  .object({
    ANTHROPIC_API_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SOLANA_RPC_URL: z.string().url(),
    DEMO_BUYER_ADDRESS: z.string().min(1),
    KEYS_DIR: optionalString(),
    PLATFORM_SECRET_KEY: optionalString(),
    AGENT_MINIMAL_SECRET_KEY: optionalString(),
    AGENT_BOLD_SECRET_KEY: optionalString(),
    AGENT_LUXE_SECRET_KEY: optionalString(),
  })
  .refine(
    (env) =>
      Boolean(env.KEYS_DIR) ||
      Boolean(
        env.PLATFORM_SECRET_KEY &&
          env.AGENT_MINIMAL_SECRET_KEY &&
          env.AGENT_BOLD_SECRET_KEY &&
          env.AGENT_LUXE_SECRET_KEY,
      ),
    {
      message:
        "Set KEYS_DIR (local) or all four *_SECRET_KEY vars (Vercel) to load agent/platform keypairs",
    },
  );

// Public vars, safe to read from client components.
const publicSchema = z.object({
  NEXT_PUBLIC_CLUSTER: z.literal("devnet"),
  NEXT_PUBLIC_SOLANA_RPC_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type PublicEnv = z.infer<typeof publicSchema>;

let cachedServerEnv: ServerEnv | undefined;
let cachedPublicEnv: PublicEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cachedServerEnv) {
    cachedServerEnv = serverSchema.parse(process.env);
  }
  return cachedServerEnv;
}

export function getPublicEnv(): PublicEnv {
  if (!cachedPublicEnv) {
    cachedPublicEnv = publicSchema.parse({
      NEXT_PUBLIC_CLUSTER: process.env.NEXT_PUBLIC_CLUSTER,
      NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  }
  return cachedPublicEnv;
}
