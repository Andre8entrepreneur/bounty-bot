// Full end-to-end test through the actual route handlers against a real
// `next start` server: creates a bounty on-chain as the deployer-buyer,
// calls /api/bounties, /run/[agent] x3, /referee, then /settle both inside
// and after the pick window — the buyer never picks, so it must stay open
// during the window and refund the buyer in full afterwards (the platform
// never awards on the buyer's behalf). Also checks 3 scored entries.
import { config } from "dotenv";
import { ChildProcess, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv, getServerEnv } from "../src/lib/env";
import { hash } from "../src/lib/hash";
import type { Brief } from "../src/lib/agents/schema";
import {
  buildCreateBountyIx,
  explorerTx,
  fetchBountyByAddress,
  findBountyPda,
  getConnection,
  getProgram,
  sendSignedInstruction,
} from "../src/lib/solana/client";
import type { AgentKey } from "../src/lib/solana/keys";
import type { BountyRow, EntryRow } from "../src/lib/types";
import devnetConfig from "../src/config/devnet.json";

config({ path: resolve(process.cwd(), ".env.local"), override: true });

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const DEADLINE_SECS = 120; // matches schema.ts's "demo" deadlinePreset
const PICK_WINDOW_SECS = 120;
const AGENTS: AgentKey[] = ["minimal", "bold", "luxe"];

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

function startServer(): Promise<ChildProcess> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn("npx", ["next", "start", "-p", String(PORT)], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error("next start did not become ready within 60s"));
    }, 60_000);

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(`[next start] ${text}`);
      if (/Ready in/i.test(text) || /started server/i.test(text)) {
        clearTimeout(timeout);
        proc.stdout?.off("data", onData);
        resolvePromise(proc);
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[next start] ${chunk.toString()}`));
    proc.on("error", reject);
  });
}

async function postJson(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`assertion failed: ${message}`);
  console.log(`  OK  ${message}`);
}

async function main(): Promise<void> {
  const serverEnv = getServerEnv();
  const publicEnv = getPublicEnv();
  if (publicEnv.NEXT_PUBLIC_CLUSTER !== "devnet") {
    console.error(`e2e:app refuses to run: NEXT_PUBLIC_CLUSTER is "${publicEnv.NEXT_PUBLIC_CLUSTER}", not "devnet".`);
    process.exit(1);
  }

  console.log("Starting next start...");
  const server = await startServer();
  console.log("Server ready.\n");

  try {
    const connection = getConnection(serverEnv.SOLANA_RPC_URL);
    const deployer = loadDeployerKeypair();
    const program = getProgram(connection, deployer);

    const brief: Brief = {
      businessName: "Lantern & Leaf",
      whatItDoes: "A cozy bubble tea shop in the 11th arrondissement of Paris, serving fresh fruit teas and milk teas with a focus on quality ingredients.",
      audience: "Students and young professionals who want an affordable, friendly treat after work or class",
      vibe: ["playful", "friendly", "warm"],
      avoid: "nothing cartoonish, no clashing neon colors",
      prizeTusdc: 10,
      deadlinePreset: "demo",
    };
    const briefHash = hash(brief);

    const bountyId = BigInt(Date.now());
    const now = Math.floor(Date.now() / 1000);
    const deadline = now + DEADLINE_SECS;

    console.log("=== Creating bounty on-chain (deployer as buyer) ===");
    const [bountyPda] = findBountyPda(deployer.publicKey, bountyId, program.programId);
    const createIx = await buildCreateBountyIx(program, {
      buyer: deployer.publicKey,
      mint: new PublicKey(devnetConfig.mint),
      bountyId,
      amount: 10_000_000,
      deadline,
      pickWindowSecs: PICK_WINDOW_SECS,
      briefHash: Buffer.from(briefHash, "hex"),
    });
    const createSig = await sendSignedInstruction(connection, createIx, deployer);
    console.log(`  bounty ${bountyPda.toBase58()} — ${explorerTx(createSig)}`);

    console.log("\n=== POST /api/bounties ===");
    const registerRes = await postJson("/api/bounties", {
      address: bountyPda.toBase58(),
      txSig: createSig,
      brief,
    });
    assert(registerRes.status === 201, `register returned 201 (got ${registerRes.status}: ${JSON.stringify(registerRes.json)})`);
    const bountyRowId = registerRes.json.id;
    assert(typeof bountyRowId === "string" && bountyRowId.length > 0, "response included a bounty row id");

    console.log("\n=== Running 3 agents ===");
    for (const agent of AGENTS) {
      const runRes = await postJson(`/api/bounties/${bountyRowId}/run/${agent}`, {});
      assert(runRes.status === 200, `run/${agent} returned 200 (got ${runRes.status}: ${JSON.stringify(runRes.json)})`);
    }

    await waitUntil(deadline, "deadline (so the referee can score entries)");

    console.log("\n=== POST /api/bounties/[id]/referee ===");
    const refereeRes = await postJson(`/api/bounties/${bountyRowId}/referee`, {});
    assert(refereeRes.status === 200, `referee returned 200 (got ${refereeRes.status}: ${JSON.stringify(refereeRes.json)})`);
    assert(Array.isArray(refereeRes.json.scored) && refereeRes.json.scored.length === 3, "referee scored all 3 entries");

    // The buyer (deployer) deliberately never picks: the platform must not
    // choose for them, and must refund in full once the pick window closes.
    console.log("\n=== POST /settle inside the pick window (must NOT settle) ===");
    const earlySettle = await postJson(`/api/bounties/${bountyRowId}/settle`, {});
    assert(earlySettle.status === 200, `early settle returned 200 (got ${earlySettle.status})`);
    assert(
      earlySettle.json.settled === false && earlySettle.json.reason === "pick window still open",
      `early settle left the bounty open for the buyer (got ${JSON.stringify(earlySettle.json)})`,
    );

    const buyerAta = getAssociatedTokenAddressSync(new PublicKey(devnetConfig.mint), deployer.publicKey);
    const buyerBefore = (await getAccount(connection, buyerAta)).amount;

    await waitUntil(deadline + PICK_WINDOW_SECS, "pick_deadline (buyer never picked)");

    console.log("\n=== POST /settle after the pick window (must refund) ===");
    const settleRes = await postJson(`/api/bounties/${bountyRowId}/settle`, {});
    assert(settleRes.status === 200, `settle returned 200 (got ${settleRes.status}: ${JSON.stringify(settleRes.json)})`);
    assert(
      settleRes.json.action === "refund" && settleRes.json.reason === "buyer did not pick",
      `settle refunded because the buyer did not pick (got ${JSON.stringify(settleRes.json)})`,
    );

    console.log("\n=== Verifying final state ===");
    const onchainBounty = await fetchBountyByAddress(program, bountyPda);
    const statusKey = onchainBounty ? Object.keys(onchainBounty.status)[0] : null;
    assert(statusKey === "refunded", `on-chain status is "refunded" (got "${statusKey}")`);

    const buyerAfter = (await getAccount(connection, buyerAta)).amount;
    assert(
      buyerAfter - buyerBefore === BigInt(10_000_000),
      `buyer got the full 10 tUSDC back (delta ${buyerAfter - buyerBefore})`,
    );

    const supabase = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY);
    const { data: dbBounty } = await supabase
      .from("bounties")
      .select("*")
      .eq("id", bountyRowId)
      .single<BountyRow>();
    assert(dbBounty?.status === "refunded", `DB row status is "refunded" (got "${dbBounty?.status}")`);

    const { data: entries } = await supabase
      .from("entries")
      .select("*")
      .eq("bounty_id", bountyRowId)
      .returns<EntryRow[]>();
    assert(Array.isArray(entries) && entries.length === 3, `3 entries recorded (got ${entries?.length})`);
    assert(
      (entries ?? []).every((e) => typeof e.referee_score === "number"),
      "every entry has a referee_score",
    );

    console.log("\ne2e:app: all checks passed");
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error("\ne2e:app FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
