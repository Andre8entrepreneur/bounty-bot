// One-command demo seed (ROADMAP 5.2): creates a "Paris bubble tea shop"
// bounty with demo timing against a running app (local `next dev`/`next
// start`, or the live Vercel deploy), exactly the way `/new` does it client-
// side (on-chain create_bounty signed by a local keypair standing in for
// Phantom, then POST /api/bounties, then fire all 3 agent runs). Prints the
// resulting /b/[id] URL to open live during the pitch.
//
// Usage:
//   npx tsx scripts/demo-seed.ts                         # seed against prod, don't wait
//   npx tsx scripts/demo-seed.ts --base-url http://localhost:3000
//   npx tsx scripts/demo-seed.ts --full                   # also waits for the
//     deadline/pick-window and calls /referee + /settle, producing a
//     finished, awarded bounty — this is the fallback page for ROADMAP 5.2:
//     run it once ahead of time and keep its URL on hand in case a live run
//     fails during the actual pitch.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getPublicEnv, getServerEnv } from "../src/lib/env";
import { hash } from "../src/lib/hash";
import type { Brief } from "../src/lib/agents/schema";
import {
  buildCreateBountyIx,
  explorerTx,
  findBountyPda,
  getConnection,
  getProgram,
  sendSignedInstruction,
} from "../src/lib/solana/client";
import type { AgentKey } from "../src/lib/solana/keys";
import devnetConfig from "../src/config/devnet.json";

config({ path: resolve(process.cwd(), ".env.local"), override: true });

const DEFAULT_BASE_URL = "https://bounty-bot-andre-qian.vercel.app";
const DEADLINE_SECS = 120; // matches schema.ts's "demo" deadlinePreset
const PICK_WINDOW_SECS = 120;
const AGENTS: AgentKey[] = ["minimal", "bold", "luxe"];

const BRIEF: Brief = {
  businessName: "Lantern & Leaf",
  whatItDoes:
    "A cozy bubble tea shop in the 11th arrondissement of Paris, serving fresh fruit teas and milk teas with a focus on quality ingredients.",
  audience:
    "Students and young professionals who want an affordable, friendly treat after work or class",
  vibe: ["playful", "friendly", "warm"],
  avoid: "nothing cartoonish, no clashing neon colors",
  prizeTusdc: 10,
  deadlinePreset: "demo",
};

function loadDeployerKeypair(): Keypair {
  const path = resolve(homedir(), ".config/solana/id.json");
  const raw = readFileSync(path, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitUntil(unixSecs: number, label: string): Promise<void> {
  const ms = unixSecs * 1000 - Date.now() + 5000;
  if (ms <= 0) return;
  console.log(`  waiting ${Math.ceil(ms / 1000)}s for ${label}...`);
  await sleep(ms);
}

function parseArgs(argv: string[]): { baseUrl: string; full: boolean } {
  let baseUrl = DEFAULT_BASE_URL;
  let full = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base-url" && argv[i + 1]) {
      baseUrl = argv[i + 1];
      i++;
    } else if (argv[i] === "--full") {
      full = true;
    }
  }
  return { baseUrl, full };
}

async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main(): Promise<void> {
  const { baseUrl, full } = parseArgs(process.argv.slice(2));
  const serverEnv = getServerEnv();
  const publicEnv = getPublicEnv();

  if (publicEnv.NEXT_PUBLIC_CLUSTER !== "devnet") {
    console.error(`demo-seed refuses to run: NEXT_PUBLIC_CLUSTER is "${publicEnv.NEXT_PUBLIC_CLUSTER}", not "devnet".`);
    process.exit(1);
  }

  console.log(`Seeding a demo bounty against ${baseUrl}${full ? " (full run, will wait for award)" : ""}\n`);

  const connection = getConnection(serverEnv.SOLANA_RPC_URL);
  const deployer = loadDeployerKeypair();
  const program = getProgram(connection, deployer);

  const briefHash = hash(BRIEF);
  const bountyId = BigInt(Date.now());
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + DEADLINE_SECS;

  console.log("=== Creating bounty on-chain (deployer as buyer) ===");
  const [bountyPda] = findBountyPda(deployer.publicKey, bountyId, program.programId);
  const createIx = await buildCreateBountyIx(program, {
    buyer: deployer.publicKey,
    mint: new PublicKey(devnetConfig.mint),
    bountyId,
    amount: BRIEF.prizeTusdc * 1_000_000,
    deadline,
    pickWindowSecs: PICK_WINDOW_SECS,
    briefHash: Buffer.from(briefHash, "hex"),
  });
  const createSig = await sendSignedInstruction(connection, createIx, deployer);
  console.log(`  bounty ${bountyPda.toBase58()} — ${explorerTx(createSig)}`);

  console.log("\n=== Registering with the app ===");
  const registerRes = await postJson(baseUrl, "/api/bounties", {
    address: bountyPda.toBase58(),
    txSig: createSig,
    brief: BRIEF,
  });
  if (registerRes.status !== 201) {
    throw new Error(`register failed (${registerRes.status}): ${JSON.stringify(registerRes.json)}`);
  }
  const bountyRowId = registerRes.json.id as string;
  const url = `${baseUrl}/b/${bountyRowId}`;
  console.log(`  ${url}`);

  console.log("\n=== Triggering the 3 agents ===");
  for (const agent of AGENTS) {
    const runRes = await postJson(baseUrl, `/api/bounties/${bountyRowId}/run/${agent}`, {});
    console.log(`  ${agent}: ${runRes.status === 200 ? "started" : `FAILED (${runRes.status})`}`);
  }

  if (!full) {
    console.log(`\nDemo bounty ready — open this during the pitch:\n  ${url}\n`);
    return;
  }

  await waitUntil(deadline, "deadline (so the referee can score entries)");
  console.log("\n=== POST /referee ===");
  const refereeRes = await postJson(baseUrl, `/api/bounties/${bountyRowId}/referee`, {});
  console.log(`  status ${refereeRes.status}: ${JSON.stringify(refereeRes.json)}`);

  await waitUntil(deadline + PICK_WINDOW_SECS, "pick_deadline (so settle can auto_award)");
  console.log("\n=== POST /settle ===");
  const settleRes = await postJson(baseUrl, `/api/bounties/${bountyRowId}/settle`, {});
  console.log(`  status ${settleRes.status}: ${JSON.stringify(settleRes.json)}`);

  console.log(`\nFallback (finished, awarded) bounty:\n  ${url}\n`);
}

main().catch((err) => {
  console.error("\ndemo-seed FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
