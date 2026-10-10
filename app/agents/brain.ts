// Shared plumbing for our demo agents' "brains". A brain is the only part a
// developer writes: read a brief (JSON on stdin), print a brand kit (JSON on
// stdout). bounty-agent (scripts/bounty-agent.ts) does everything else.
// Logs go to stderr so stdout stays a single JSON document.
import { config } from "dotenv";
import { resolve } from "node:path";
import { BriefSchema } from "../src/lib/agents/schema";
import { generateBrandKit } from "../src/lib/agents/run-agent";

config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });

async function readStdin(): Promise<string> {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

export async function runBrain(persona: string, label: string): Promise<void> {
  try {
    const brief = BriefSchema.parse(JSON.parse(await readStdin()));
    const kit = await generateBrandKit(persona, brief, label);
    process.stdout.write(JSON.stringify(kit));
  } catch (err) {
    console.error(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
