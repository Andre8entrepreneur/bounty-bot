import { config } from "dotenv";
import { resolve } from "node:path";

// Never print values — only whether each variable is present.
config({ path: resolve(process.cwd(), ".env.local") });

const REQUIRED = [
  "ANTHROPIC_API_KEY",
  "AGENT_MODEL",
  "REFEREE_MODEL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SOLANA_RPC_URL",
  "DEMO_BUYER_ADDRESS",
  "NEXT_PUBLIC_CLUSTER",
  "NEXT_PUBLIC_SOLANA_RPC_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const VERCEL_SECRET_KEYS = [
  "PLATFORM_SECRET_KEY",
  "AGENT_MINIMAL_SECRET_KEY",
  "AGENT_BOLD_SECRET_KEY",
  "AGENT_LUXE_SECRET_KEY",
] as const;

function isSet(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

let ok = true;

console.log("Required:");
for (const name of REQUIRED) {
  const present = isSet(name);
  if (!present) ok = false;
  console.log(`  ${name}: ${present ? "set" : "missing"}`);
}

console.log("\nAgent/platform keys (KEYS_DIR locally, or all 4 *_SECRET_KEY vars on Vercel):");
const keysDirSet = isSet("KEYS_DIR");
console.log(`  KEYS_DIR: ${keysDirSet ? "set" : "missing"}`);
const vercelKeysSet = VERCEL_SECRET_KEYS.every(isSet);
for (const name of VERCEL_SECRET_KEYS) {
  console.log(`  ${name}: ${isSet(name) ? "set" : "missing"}`);
}
if (!keysDirSet && !vercelKeysSet) {
  ok = false;
  console.log("  -> neither KEYS_DIR nor the full Vercel key set is present");
}

if (!ok) {
  console.error("\ncheck:env: missing required variables");
  process.exit(1);
}

console.log("\ncheck:env: all required variables are set");
