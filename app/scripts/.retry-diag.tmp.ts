import { config } from "dotenv";
import { resolve } from "node:path";
import { generateBrandKitRun } from "../src/lib/agents/run-agent";
import { PERSONAS } from "../src/lib/agents/personas";
import type { Brief } from "../src/lib/agents/schema";
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });

const BRIEF: Brief = {
  businessName: "Lantern & Leaf",
  whatItDoes: "A cozy bubble tea shop in the 11th arrondissement of Paris, serving fresh fruit teas and milk teas with a focus on quality ingredients.",
  audience: "Students and young professionals who want an affordable, friendly treat after work or class",
  vibe: ["playful", "friendly", "warm"],
  avoid: "nothing cartoonish, no clashing neon colors",
  prizeTusdc: 10,
  deadlinePreset: "demo",
};
const warnings: string[] = [];
console.warn = (msg: string) => warnings.push(String(msg));

async function main() {
  const jobs = (["minimal", "bold", "luxe"] as const).flatMap((p) => [1, 2, 3, 4, 5, 6].map((i) => ({ p, i })));
  const rows = await Promise.all(jobs.map(async ({ p, i }) => {
    const t = Date.now();
    try {
      const r = await generateBrandKitRun(PERSONAS[p], BRIEF, `${p}#${i}`);
      return `${p}#${i} ok attempts=${r.usage.attempts} ${Math.round((Date.now() - t) / 1000)}s in=${r.usage.inputTokens} out=${r.usage.outputTokens} model=${r.model} longestScene=${Math.max(...r.kit.moodboard.map((m) => m.length))}`;
    } catch (e) {
      return `${p}#${i} FAILED ${Math.round((Date.now() - t) / 1000)}s ${(e as Error).message.slice(0, 300)}`;
    }
  }));
  rows.forEach((r) => console.log(r));
  console.log(`\nfirst-attempt failures: ${warnings.length}`);
  warnings.forEach((w) => console.log("  " + w));
}
void main();
