// André-only. Claude Code must never run this script — it prints secret
// base58 keys to stdout for pasting into Vercel's environment variables.
import { config } from "dotenv";
import { resolve } from "node:path";
import bs58 from "bs58";
import { getAgentKeypair, getPlatformKeypair } from "../src/lib/solana/keys";

config({ path: resolve(process.cwd(), ".env.local") });

console.log(`PLATFORM_SECRET_KEY=${bs58.encode(getPlatformKeypair().secretKey)}`);
console.log(`AGENT_MINIMAL_SECRET_KEY=${bs58.encode(getAgentKeypair("minimal").secretKey)}`);
console.log(`AGENT_BOLD_SECRET_KEY=${bs58.encode(getAgentKeypair("bold").secretKey)}`);
console.log(`AGENT_LUXE_SECRET_KEY=${bs58.encode(getAgentKeypair("luxe").secretKey)}`);
