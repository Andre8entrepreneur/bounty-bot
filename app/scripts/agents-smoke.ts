import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentKey } from "../src/lib/solana/keys";
import type { Brief, BrandKit } from "../src/lib/agents/schema";
import { runAgent } from "../src/lib/agents/run-agent";
import { judgeEntry, type RefereeResult } from "../src/lib/agents/referee";

config({ path: resolve(process.cwd(), ".env.local"), override: true });

const SAMPLE_BRIEF: Brief = {
  businessName: "Lantern & Leaf",
  whatItDoes: "A neighborhood bubble tea shop in Paris serving fruit teas, classic milk teas, and seasonal specials made with fresh, locally-sourced ingredients.",
  audience: "Students and young professionals in the 11th arrondissement who want an affordable treat between classes or after work.",
  vibe: ["warm", "friendly", "playful"],
  avoid: "Nothing too childish or cartoonish — this should feel like a real, grown-up neighborhood spot, not a kids' snack bar.",
  prizeTusdc: 50,
  deadlinePreset: "demo",
};

const AGENTS: AgentKey[] = ["minimal", "bold", "luxe"];

const OFF_BRIEF_KIT: BrandKit = {
  names: ["Thunderclap Arena", "Vortex Gaming Hub", "Rage Quit Lounge"],
  tagline: "ENTER THE BATTLE ZONE!!!",
  palette: [
    { name: "Toxic Green", hex: "#39FF14" },
    { name: "Blood Red", hex: "#FF0000" },
    { name: "Electric Purple", hex: "#BF00FF" },
    { name: "Neon Yellow", hex: "#FFFF00" },
    { name: "Black", hex: "#000000" },
  ],
  fonts: { heading: "Archivo Black", body: "Oswald" },
  logoSvg:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,5 95,95 5,95" fill="#FF0000" /></svg>',
  moodboard: [
    "A neon-lit esports arena with screaming crowds",
    "Gaming controllers smashed on the floor in victory rage",
    "A cartoon skull wearing a headset, breathing fire",
    "Energy drink cans stacked in a pyramid under strobe lights",
  ],
  rationale:
    "This kit is a loud, chaotic gaming-arena identity built for an esports venue — aggressive colors, explosive imagery, and a confrontational tagline. It deliberately ignores a cozy neighborhood bubble tea shop's brief: wrong audience, wrong tone, wrong everything, to exercise the referee's ability to reject an off-brief submission.",
};

interface SmokeRow {
  agent: string;
  valid: boolean;
  pass: boolean | null;
  score: number | null;
  ms: number;
  error?: string;
}

async function runOneAgent(agentKey: AgentKey): Promise<{ row: SmokeRow; kit: BrandKit | null; verdict: RefereeResult | null }> {
  const start = Date.now();
  try {
    const kit = await runAgent(agentKey, SAMPLE_BRIEF);
    const verdict = await judgeEntry(SAMPLE_BRIEF, kit);
    return {
      row: { agent: agentKey, valid: true, pass: verdict.pass, score: verdict.score, ms: Date.now() - start },
      kit,
      verdict,
    };
  } catch (err) {
    return {
      row: {
        agent: agentKey,
        valid: false,
        pass: null,
        score: null,
        ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      },
      kit: null,
      verdict: null,
    };
  }
}

function printTable(rows: SmokeRow[]): void {
  console.log("\nagent     valid  pass   score  ms");
  console.log("--------  -----  -----  -----  -----");
  for (const r of rows) {
    console.log(
      `${r.agent.padEnd(8)}  ${String(r.valid).padEnd(5)}  ${String(r.pass).padEnd(5)}  ${String(r.score ?? "-").padEnd(5)}  ${r.ms}`,
    );
    if (r.error) console.log(`  error: ${r.error}`);
  }
}

async function main(): Promise<void> {
  console.log(`Running ${AGENTS.length} agents in parallel against the sample brief...`);
  const results = await Promise.all(AGENTS.map(runOneAgent));
  const rows = results.map((r) => r.row);
  printTable(rows);

  const outDir = resolve(process.cwd(), "tmp");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, "agents-smoke-results.json"),
    JSON.stringify({ brief: SAMPLE_BRIEF, results }, null, 2),
  );

  console.log("\nChecking the off-brief fixture is correctly rejected by the referee...");
  const offBriefStart = Date.now();
  const offBriefVerdict = await judgeEntry(SAMPLE_BRIEF, OFF_BRIEF_KIT);
  const offBriefMs = Date.now() - offBriefStart;
  console.log(
    `off-brief fixture: pass=${offBriefVerdict.pass} score=${offBriefVerdict.score} ms=${offBriefMs}`,
  );
  console.log(`  reasons: ${offBriefVerdict.reasons.join(" | ")}`);
  writeFileSync(
    resolve(outDir, "agents-smoke-off-brief.json"),
    JSON.stringify({ kit: OFF_BRIEF_KIT, verdict: offBriefVerdict }, null, 2),
  );

  const allValid = rows.every((r) => r.valid);
  const offBriefCorrectlyFailed = offBriefVerdict.pass === false;

  if (!allValid) {
    console.error("\nagents:smoke FAILED: not all 3 agents produced a valid kit.");
    process.exit(1);
  }
  if (!offBriefCorrectlyFailed) {
    console.error("\nagents:smoke FAILED: the off-brief fixture should have failed the referee.");
    process.exit(1);
  }

  console.log("\nagents:smoke OK: 3/3 valid kits, off-brief fixture correctly failed the referee.");
}

main().catch((err) => {
  console.error("agents:smoke crashed:", err);
  process.exit(1);
});
