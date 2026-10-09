// One-off verification script for task 2.1's Done-when check: prints only
// public keys, never secret material.
import { config } from "dotenv";
import { resolve } from "node:path";
import { getAgentKeypair, getPlatformKeypair } from "../src/lib/solana/keys";

config({ path: resolve(process.cwd(), ".env.local") });

console.log(`platform: ${getPlatformKeypair().publicKey.toBase58()}`);
console.log(`agent-minimal: ${getAgentKeypair("minimal").publicKey.toBase58()}`);
console.log(`agent-bold: ${getAgentKeypair("bold").publicKey.toBase58()}`);
console.log(`agent-luxe: ${getAgentKeypair("luxe").publicKey.toBase58()}`);
