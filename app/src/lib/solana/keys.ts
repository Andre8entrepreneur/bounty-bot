// Not wrapped in `import "server-only"`: this module is also loaded by
// standalone scripts (devnet:setup, keys-export, ...) run via tsx outside
// Next.js's bundler, where that sentinel always throws. It is never imported
// from client components, and Next.js only inlines NEXT_PUBLIC_* vars into
// the client bundle regardless, so these secrets can't leak that way.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { getServerEnv } from "@/lib/env";

export type AgentKey = "minimal" | "bold" | "luxe";
type KeyRole = "platform" | AgentKey;

const KEY_FILENAMES: Record<KeyRole, string> = {
  platform: "platform.json",
  minimal: "agent-minimal.json",
  bold: "agent-bold.json",
  luxe: "agent-luxe.json",
};

function envVarFor(role: KeyRole): "PLATFORM_SECRET_KEY" | "AGENT_MINIMAL_SECRET_KEY" | "AGENT_BOLD_SECRET_KEY" | "AGENT_LUXE_SECRET_KEY" {
  switch (role) {
    case "platform":
      return "PLATFORM_SECRET_KEY";
    case "minimal":
      return "AGENT_MINIMAL_SECRET_KEY";
    case "bold":
      return "AGENT_BOLD_SECRET_KEY";
    case "luxe":
      return "AGENT_LUXE_SECRET_KEY";
  }
}

function loadFromFile(keysDir: string, role: KeyRole): Keypair {
  const path = resolve(keysDir, KEY_FILENAMES[role]);
  // Local-dev-only path (Vercel always sets the *_SECRET_KEY vars instead,
  // so this branch never runs in production) — told not to trace/bundle it.
  const raw = readFileSync(/* turbopackIgnore: true */ path, "utf-8");
  const secret = Uint8Array.from(JSON.parse(raw) as number[]);
  return Keypair.fromSecretKey(secret);
}

function loadFromBase58(secret: string): Keypair {
  return Keypair.fromSecretKey(bs58.decode(secret));
}

function loadKeypair(role: KeyRole): Keypair {
  const env = getServerEnv();
  if (env.KEYS_DIR) {
    return loadFromFile(env.KEYS_DIR, role);
  }
  const secret = env[envVarFor(role)];
  if (!secret) {
    throw new Error(
      `Missing keypair for "${role}": set KEYS_DIR (local) or ${envVarFor(role)} (Vercel).`,
    );
  }
  return loadFromBase58(secret);
}

const cache = new Map<KeyRole, Keypair>();

function getCached(role: KeyRole): Keypair {
  let kp = cache.get(role);
  if (!kp) {
    kp = loadKeypair(role);
    cache.set(role, kp);
  }
  return kp;
}

export function getPlatformKeypair(): Keypair {
  return getCached("platform");
}

export function getAgentKeypair(agent: AgentKey): Keypair {
  return getCached(agent);
}
