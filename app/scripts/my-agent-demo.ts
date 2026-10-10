// Demonstrates a genuinely third-party agent (not one of our 3 built-in
// personas) competing for real: generates a fresh devnet keypair (saved
// outside the repo), funds it with a little SOL, creates a bounty against
// the live app (or targets an existing one with --bounty), fires our 3
// built-in agents at it too, and submits a 4th entry directly on-chain under
// the new keypair — no DB row, no kit content, exactly what a real external
// agent calling submit_entry would produce. Open the printed /b/[id] URL as
// the buyer and click "Pick this one" on the 4th card to award it; then
// paste the printed pubkey into /agent to watch the payout land.
//
// Usage:
//   npx tsx scripts/my-agent-demo.ts
//   npx tsx scripts/my-agent-demo.ts --base-url http://localhost:3000
//   npx tsx scripts/my-agent-demo.ts --deadline-secs 300 --pick-window-secs 600
import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { getPublicEnv, getServerEnv } from "../src/lib/env";
import { hash } from "../src/lib/hash";
import type { Brief } from "../src/lib/agents/schema";
import {
  buildCreateBountyIx,
  buildSubmitEntryIx,
  explorerAddress,
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
const MY_AGENT_KEY_PATH = resolve(homedir(), "my-agent-keys", "my-agent.json");
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

/** Idempotent: reuses the same "my agent" wallet across runs instead of
 * generating a new throwaway one every time, so its on-chain history
 * accumulates and it's easy to point back at on /agent. */
function loadOrCreateMyAgentKeypair(): Keypair {
  if (existsSync(MY_AGENT_KEY_PATH)) {
    const raw = readFileSync(MY_AGENT_KEY_PATH, "utf-8");
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
  }
  const kp = Keypair.generate();
  mkdirSync(resolve(homedir(), "my-agent-keys"), { recursive: true });
  writeFileSync(MY_AGENT_KEY_PATH, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

function parseArgs(argv: string[]) {
  let baseUrl = DEFAULT_BASE_URL;
  let deadlineSecs = 300;
  let pickWindowSecs = 600;
  let bountyAddress: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base-url" && argv[i + 1]) baseUrl = argv[++i];
    else if (argv[i] === "--deadline-secs" && argv[i + 1]) deadlineSecs = Number(argv[++i]);
    else if (argv[i] === "--pick-window-secs" && argv[i + 1]) pickWindowSecs = Number(argv[++i]);
    else if (argv[i] === "--bounty" && argv[i + 1]) bountyAddress = argv[++i];
  }
  return { baseUrl, deadlineSecs, pickWindowSecs, bountyAddress };
}

async function postJson(baseUrl: string, path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json: json as Record<string, unknown> };
}

async function main(): Promise<void> {
  const { baseUrl, deadlineSecs, pickWindowSecs, bountyAddress } = parseArgs(process.argv.slice(2));
  const serverEnv = getServerEnv();
  const publicEnv = getPublicEnv();

  if (publicEnv.NEXT_PUBLIC_CLUSTER !== "devnet") {
    console.error(`my-agent-demo refuses to run: NEXT_PUBLIC_CLUSTER is "${publicEnv.NEXT_PUBLIC_CLUSTER}", not "devnet".`);
    process.exit(1);
  }
  if (bountyAddress) {
    console.error("my-agent-demo: --bounty (targeting an existing open bounty) isn't implemented yet — always creates a fresh one.");
    process.exit(1);
  }

  const connection = getConnection(serverEnv.SOLANA_RPC_URL);
  const deployer = loadDeployerKeypair();
  const myAgent = loadOrCreateMyAgentKeypair();
  const program = getProgram(connection, deployer);

  console.log(`My agent's wallet (safe to share — this is a public key, not a secret):`);
  console.log(`  ${myAgent.publicKey.toBase58()}`);
  console.log(`  ${explorerAddress(myAgent.publicKey.toBase58())}\n`);

  console.log("=== Funding my agent's wallet with devnet SOL ===");
  const lamportsNeeded = 0.02 * 1e9;
  const currentBalance = await connection.getBalance(myAgent.publicKey);
  if (currentBalance < lamportsNeeded) {
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: deployer.publicKey,
        toPubkey: myAgent.publicKey,
        lamports: lamportsNeeded - currentBalance,
      }),
    );
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    fundTx.recentBlockhash = blockhash;
    fundTx.feePayer = deployer.publicKey;
    fundTx.sign(deployer);
    const sig = await connection.sendRawTransaction(fundTx.serialize());
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    console.log(`  funded — ${explorerTx(sig)}`);
  } else {
    console.log("  already funded, skipping");
  }

  const briefHash = hash(BRIEF);
  const bountyId = BigInt(Date.now());
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + deadlineSecs;

  console.log("\n=== Creating bounty on-chain (deployer as buyer) ===");
  const [bountyPda] = findBountyPda(deployer.publicKey, bountyId, program.programId);
  const createIx = await buildCreateBountyIx(program, {
    buyer: deployer.publicKey,
    mint: new PublicKey(devnetConfig.mint),
    bountyId,
    amount: BRIEF.prizeTusdc * 1_000_000,
    deadline,
    pickWindowSecs,
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

  console.log("\n=== Triggering the 3 built-in agents ===");
  for (const agent of AGENTS) {
    const runRes = await postJson(baseUrl, `/api/bounties/${bountyRowId}/run/${agent}`, {});
    console.log(`  ${agent}: ${runRes.status === 200 ? "started" : `FAILED (${runRes.status})`}`);
  }

  console.log("\n=== Submitting my agent's entry directly on-chain (bypassing our app entirely) ===");
  const content = {
    note: "Submitted by an independent agent, outside the Bounty Bot codebase.",
    submittedBy: "scripts/my-agent-demo.ts",
    at: new Date().toISOString(),
  };
  const contentHash = hash(content);
  const submitIx = await buildSubmitEntryIx(program, {
    agent: myAgent.publicKey,
    buyer: deployer.publicKey,
    bountyId,
    contentHash: Buffer.from(contentHash, "hex"),
  });
  const submitSig = await sendSignedInstruction(connection, submitIx, myAgent);
  console.log(`  submitted — ${explorerTx(submitSig)}`);

  console.log(`\nReady — open this during the demo and click "Pick this one" on the 4th card:`);
  console.log(`  ${url}`);
  console.log(`\nThen check the payout by pasting this address into ${baseUrl}/agent:`);
  console.log(`  ${myAgent.publicKey.toBase58()}`);
}

main().catch((err) => {
  console.error("\nmy-agent-demo FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
