// Scripted on-chain end-to-end test against real devnet, using the deployer
// as buyer, 60s deadline / 60s pick window:
//   (A) create -> 3 entries -> wait -> pick_winner
//   (B) create -> 1 entry   -> wait -> auto_award
//   (C) create -> 0 entries -> wait -> buyer refund
// Exits 0 only if every balance change matches expectations (winner +90%,
// treasury +10%, refund 100%). Scenarios run sequentially (not in parallel)
// because A and B both pay into the same shared treasury ATA — measuring
// each scenario's fee delta in isolation requires no interleaving.
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { getServerEnv } from "../src/lib/env";
import {
  buildAutoAwardIx,
  buildCreateBountyIx,
  buildPickWinnerIx,
  buildRefundIx,
  buildSubmitEntryIx,
  explorerTx,
  findBountyPda,
  findVaultPda,
  getConnection,
  getProgram,
  sendSignedInstruction,
} from "../src/lib/solana/client";
import { getAgentKeypair, getPlatformKeypair, type AgentKey } from "../src/lib/solana/keys";

config({ path: resolve(process.cwd(), ".env.local"), override: true });

const BOUNTY_AMOUNT = 10_000_000; // 10 tUSDC (6 decimals)
// The program's hard minimum is exactly 60s; a plain 60s here regularly trips
// InvalidDeadline because a few seconds of network/confirmation latency pass
// between computing `now` client-side and the instruction actually landing
// on-chain. 90s keeps the spirit of "short devnet test timing" with margin.
const DEADLINE_SECS = 90;
const PICK_WINDOW_SECS = 90;
const FEE_BPS = 1000; // matches devnet:setup's initialize_config call

function loadDeployerKeypair(): Keypair {
  const path = resolve(homedir(), ".config/solana/id.json");
  const raw = readFileSync(path, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
}

function readDevnetConfig(): { mint: string; treasury: string } {
  const p = resolve(process.cwd(), "src/config/devnet.json");
  return JSON.parse(readFileSync(p, "utf-8"));
}

function randomHash(): Uint8Array {
  return new Uint8Array(randomBytes(32));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitUntil(unixSecs: number, label: string): Promise<void> {
  const ms = unixSecs * 1000 - Date.now() + 5000; // +5s buffer for clock drift
  if (ms <= 0) return;
  console.log(`  waiting ${Math.ceil(ms / 1000)}s for ${label}...`);
  await sleep(ms);
}

async function tokenBalance(connection: ReturnType<typeof getConnection>, ata: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(connection, ata)).amount;
  } catch {
    return BigInt(0);
  }
}

function assertEqual(label: string, actual: bigint, expected: bigint): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`  OK  ${label}: ${actual}`);
}

interface Ctx {
  connection: ReturnType<typeof getConnection>;
  program: ReturnType<typeof getProgram>;
  deployer: Keypair;
  platform: Keypair;
  mint: PublicKey;
  treasury: PublicKey;
  treasuryAta: PublicKey;
}

async function scenarioA(ctx: Ctx): Promise<void> {
  console.log("\n=== Scenario A: create -> 3 entries -> pick_winner ===");
  const bountyId = BigInt(Date.now());
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + DEADLINE_SECS;

  const [bountyPda] = findBountyPda(ctx.deployer.publicKey, bountyId, ctx.program.programId);
  const [vaultPda] = findVaultPda(bountyPda, ctx.program.programId);

  const createIx = await buildCreateBountyIx(ctx.program, {
    buyer: ctx.deployer.publicKey,
    mint: ctx.mint,
    bountyId,
    amount: BOUNTY_AMOUNT,
    deadline,
    pickWindowSecs: PICK_WINDOW_SECS,
    briefHash: randomHash(),
  });
  const createSig = await sendSignedInstruction(ctx.connection, createIx, ctx.deployer);
  console.log(`  created bounty ${bountyPda.toBase58()} — ${explorerTx(createSig)}`);

  const agents: AgentKey[] = ["minimal", "bold", "luxe"];
  for (const agentKey of agents) {
    const agent = getAgentKeypair(agentKey);
    const ix = await buildSubmitEntryIx(ctx.program, {
      agent: agent.publicKey,
      buyer: ctx.deployer.publicKey,
      bountyId,
      contentHash: randomHash(),
    });
    const sig = await sendSignedInstruction(ctx.connection, ix, agent);
    console.log(`  entry from ${agentKey} — ${explorerTx(sig)}`);
  }

  await waitUntil(deadline, "deadline (so pick_winner's window opens)");

  const treasuryBefore = await tokenBalance(ctx.connection, ctx.treasuryAta);
  const winnerAgent = getAgentKeypair("minimal");
  const winnerAtaAddr = getAssociatedTokenAddressSync(ctx.mint, winnerAgent.publicKey);
  const winnerBefore = await tokenBalance(ctx.connection, winnerAtaAddr);

  const pickIx = await buildPickWinnerIx(ctx.program, {
    buyer: ctx.deployer.publicKey,
    bountyId,
    mint: ctx.mint,
    treasury: ctx.treasury,
    winnerAgent: winnerAgent.publicKey,
  });
  const pickSig = await sendSignedInstruction(ctx.connection, pickIx, ctx.deployer);
  console.log(`  pick_winner (minimal) — ${explorerTx(pickSig)}`);

  const vaultAfter = await tokenBalance(ctx.connection, vaultPda);
  const treasuryAfter = await tokenBalance(ctx.connection, ctx.treasuryAta);
  const winnerAfter = await tokenBalance(ctx.connection, winnerAtaAddr);

  const expectedFee = (BigInt(BOUNTY_AMOUNT) * BigInt(FEE_BPS)) / BigInt(10_000);
  const expectedPayout = BigInt(BOUNTY_AMOUNT) - expectedFee;

  assertEqual("vault after pick_winner", vaultAfter, BigInt(0));
  assertEqual("treasury delta", treasuryAfter - treasuryBefore, expectedFee);
  assertEqual("winner delta", winnerAfter - winnerBefore, expectedPayout);
}

async function scenarioB(ctx: Ctx): Promise<void> {
  console.log("\n=== Scenario B: create -> 1 entry -> auto_award ===");
  const bountyId = BigInt(Date.now());
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + DEADLINE_SECS;
  const pickDeadline = deadline + PICK_WINDOW_SECS;

  const [bountyPda] = findBountyPda(ctx.deployer.publicKey, bountyId, ctx.program.programId);
  const [vaultPda] = findVaultPda(bountyPda, ctx.program.programId);

  const createIx = await buildCreateBountyIx(ctx.program, {
    buyer: ctx.deployer.publicKey,
    mint: ctx.mint,
    bountyId,
    amount: BOUNTY_AMOUNT,
    deadline,
    pickWindowSecs: PICK_WINDOW_SECS,
    briefHash: randomHash(),
  });
  const createSig = await sendSignedInstruction(ctx.connection, createIx, ctx.deployer);
  console.log(`  created bounty ${bountyPda.toBase58()} — ${explorerTx(createSig)}`);

  const agent = getAgentKeypair("bold");
  const entryIx = await buildSubmitEntryIx(ctx.program, {
    agent: agent.publicKey,
    buyer: ctx.deployer.publicKey,
    bountyId,
    contentHash: randomHash(),
  });
  const entrySig = await sendSignedInstruction(ctx.connection, entryIx, agent);
  console.log(`  entry from bold — ${explorerTx(entrySig)}`);

  await waitUntil(pickDeadline, "pick_deadline (so auto_award is allowed)");

  const treasuryBefore = await tokenBalance(ctx.connection, ctx.treasuryAta);
  const winnerAtaAddr = getAssociatedTokenAddressSync(ctx.mint, agent.publicKey);
  const winnerBefore = await tokenBalance(ctx.connection, winnerAtaAddr);

  const awardIx = await buildAutoAwardIx(ctx.program, {
    admin: ctx.platform.publicKey,
    buyer: ctx.deployer.publicKey,
    bountyId,
    mint: ctx.mint,
    treasury: ctx.treasury,
    winnerAgent: agent.publicKey,
  });
  const awardSig = await sendSignedInstruction(ctx.connection, awardIx, ctx.platform);
  console.log(`  auto_award (bold) — ${explorerTx(awardSig)}`);

  const vaultAfter = await tokenBalance(ctx.connection, vaultPda);
  const treasuryAfter = await tokenBalance(ctx.connection, ctx.treasuryAta);
  const winnerAfter = await tokenBalance(ctx.connection, winnerAtaAddr);

  const expectedFee = (BigInt(BOUNTY_AMOUNT) * BigInt(FEE_BPS)) / BigInt(10_000);
  const expectedPayout = BigInt(BOUNTY_AMOUNT) - expectedFee;

  assertEqual("vault after auto_award", vaultAfter, BigInt(0));
  assertEqual("treasury delta", treasuryAfter - treasuryBefore, expectedFee);
  assertEqual("winner delta", winnerAfter - winnerBefore, expectedPayout);
}

async function scenarioC(ctx: Ctx): Promise<void> {
  console.log("\n=== Scenario C: create -> 0 entries -> buyer refund ===");
  const bountyId = BigInt(Date.now());
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + DEADLINE_SECS;

  const [bountyPda] = findBountyPda(ctx.deployer.publicKey, bountyId, ctx.program.programId);
  const [vaultPda] = findVaultPda(bountyPda, ctx.program.programId);

  const createIx = await buildCreateBountyIx(ctx.program, {
    buyer: ctx.deployer.publicKey,
    mint: ctx.mint,
    bountyId,
    amount: BOUNTY_AMOUNT,
    deadline,
    pickWindowSecs: PICK_WINDOW_SECS,
    briefHash: randomHash(),
  });
  const createSig = await sendSignedInstruction(ctx.connection, createIx, ctx.deployer);
  console.log(`  created bounty ${bountyPda.toBase58()} — ${explorerTx(createSig)}`);

  await waitUntil(deadline, "deadline (so buyer self-refund is allowed)");

  const buyerAtaAddr = getAssociatedTokenAddressSync(ctx.mint, ctx.deployer.publicKey);
  const buyerBefore = await tokenBalance(ctx.connection, buyerAtaAddr);

  const refundIx = await buildRefundIx(ctx.program, {
    signer: ctx.deployer.publicKey,
    buyer: ctx.deployer.publicKey,
    bountyId,
    mint: ctx.mint,
  });
  const refundSig = await sendSignedInstruction(ctx.connection, refundIx, ctx.deployer);
  console.log(`  refund (buyer self-refund) — ${explorerTx(refundSig)}`);

  const vaultAfter = await tokenBalance(ctx.connection, vaultPda);
  const buyerAfter = await tokenBalance(ctx.connection, buyerAtaAddr);

  assertEqual("vault after refund", vaultAfter, BigInt(0));
  assertEqual("buyer delta", buyerAfter - buyerBefore, BigInt(BOUNTY_AMOUNT));
}

async function main(): Promise<void> {
  const env = getServerEnv();
  const connection = getConnection(env.SOLANA_RPC_URL);
  const deployer = loadDeployerKeypair();
  const platform = getPlatformKeypair();
  const devnetConfig = readDevnetConfig();
  const mint = new PublicKey(devnetConfig.mint);
  const treasury = new PublicKey(devnetConfig.treasury);
  const program = getProgram(connection, deployer);
  const treasuryAta = getAssociatedTokenAddressSync(mint, treasury);

  const ctx: Ctx = { connection, program, deployer, platform, mint, treasury, treasuryAta };

  await scenarioA(ctx);
  await scenarioB(ctx);
  await scenarioC(ctx);

  console.log("\ne2e:devnet: all scenarios passed");
}

main().catch((err) => {
  console.error("\ne2e:devnet FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
