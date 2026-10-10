// Demonstrates a genuinely third-party agent (not one of our 3 built-in
// personas) competing for real.
//
// Two modes:
//   --bounty <row id>   JOIN a bounty that already exists (e.g. one YOU
//     posted yourself through /new with your own Phantom wallet). This is
//     the one that matters for a live demo: only the real on-chain buyer
//     can click "Pick this one", so a bounty my scripts create (buyer = the
//     deployer keypair) can never be picked by your own connected wallet.
//     Submits my agent's entry directly on-chain to that bounty — no DB
//     row, no kit content, exactly what a real external agent calling
//     submit_entry would produce.
//   (no --bounty)       CREATE a fresh bounty too, buyer = the deployer
//     keypair. Useful for unattended backend testing (e.g. confirming the
//     4-card render, the payout math) — NOT for a live demo, since you
//     can't click "Pick this one" on a bounty you didn't personally create.
//
//   --loop              NON-STOP: watch the mission board forever and join
//     every new bounty (several at once if needed), topping up its own gas.
//     Run it detached with `npm run agent:david:start` (stop / logs scripts
//     next to it in package.json).
//   --watch             join only the next new bounty, then exit.
//
// Usage:
//   npx tsx scripts/my-agent-demo.ts --loop
//   npx tsx scripts/my-agent-demo.ts --bounty <bounty row id from the /b/ URL>
//   npx tsx scripts/my-agent-demo.ts                         # create mode
//   npx tsx scripts/my-agent-demo.ts --base-url http://localhost:3000
//   npx tsx scripts/my-agent-demo.ts --deadline-secs 300 --pick-window-secs 600
import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv, getServerEnv } from "../src/lib/env";
import { hash } from "../src/lib/hash";
import { BriefSchema, type Brief } from "../src/lib/agents/schema";
import { generateBrandKit } from "../src/lib/agents/run-agent";
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
import type { BountyRow } from "../src/lib/types";
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

// This agent's own creative direction — deliberately unlike our 3 personas,
// the way an outside developer's agent would have its own take.
const MY_AGENT_PERSONA = `You are an independent brand designer with a retro-editorial
signature: the confidence of vintage print — old travel posters, mid-century
magazine mastheads, letterpress menus. You favor warm, slightly faded palettes
anchored by one ink-dark neutral, and pair a characterful serif headline face
with a clean body face. Your logos are emblem- or badge-like marks with a bit
of history in them, built from simple geometry so they still read at 16px.
Every kit should feel like it has been around for decades and earned its
place. Taglines are short, warm, and a little witty.`;

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
  let watch = false;
  let loop = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base-url" && argv[i + 1]) baseUrl = argv[++i];
    else if (argv[i] === "--deadline-secs" && argv[i + 1]) deadlineSecs = Number(argv[++i]);
    else if (argv[i] === "--pick-window-secs" && argv[i + 1]) pickWindowSecs = Number(argv[++i]);
    else if (argv[i] === "--bounty" && argv[i + 1]) bountyAddress = argv[++i];
    else if (argv[i] === "--watch") watch = true;
    else if (argv[i] === "--loop") loop = true;
  }
  return { baseUrl, deadlineSecs, pickWindowSecs, bountyAddress, watch, loop };
}

const WATCH_POLL_MS = 2_000;
const WATCH_TIMEOUT_MS = 15 * 60_000;

/** Waits for the next bounty posted after this script started — the way a
 * real agent would sit on the mission board and jump into new missions —
 * and returns its row id. */
async function waitForNewBounty(
  supabase: SupabaseClient,
  startedAt: Date,
): Promise<string> {
  const giveUpAt = Date.now() + WATCH_TIMEOUT_MS;
  while (Date.now() < giveUpAt) {
    const { data } = await supabase
      .from("bounties")
      .select("id,deadline")
      .eq("status", "open")
      .gt("created_at", startedAt.toISOString())
      .order("created_at", { ascending: true })
      .limit(1)
      .returns<Array<{ id: string; deadline: string | null }>>();
    const next = data?.[0];
    if (next?.deadline && new Date(next.deadline).getTime() > Date.now()) return next.id;
    await new Promise((r) => setTimeout(r, WATCH_POLL_MS));
  }
  throw new Error("no new bounty was posted within 15 minutes");
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

interface Ctx {
  baseUrl: string;
  connection: ReturnType<typeof getConnection>;
  program: ReturnType<typeof getProgram>;
  supabase: SupabaseClient;
  myAgent: Keypair;
}

const MIN_LAMPORTS = 0.01 * 1e9;
const TOP_UP_LAMPORTS = 0.05 * 1e9;
let fundingInFlight: Promise<void> | null = null;

/** Each entry costs the agent a little SOL (the Entry account's rent + the
 * fee), so top it up from the deployer whenever it runs low. Serialized so
 * concurrent joins don't each send a top-up. */
function ensureFunded(ctx: Ctx): Promise<void> {
  fundingInFlight ??= (async () => {
    const balance = await ctx.connection.getBalance(ctx.myAgent.publicKey);
    if (balance >= MIN_LAMPORTS) return;
    const deployer = loadDeployerKeypair();
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: deployer.publicKey,
        toPubkey: ctx.myAgent.publicKey,
        lamports: TOP_UP_LAMPORTS - balance,
      }),
    );
    const { blockhash, lastValidBlockHeight } = await ctx.connection.getLatestBlockhash();
    fundTx.recentBlockhash = blockhash;
    fundTx.feePayer = deployer.publicKey;
    fundTx.sign(deployer);
    const sig = await ctx.connection.sendRawTransaction(fundTx.serialize());
    await ctx.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    console.log(`  topped up gas — ${explorerTx(sig)}`);
  })().finally(() => {
    fundingInFlight = null;
  });
  return fundingInFlight;
}

/** The agent's whole job on one bounty: read the brief, design a kit, commit
 * its hash on-chain (submit_entry, signed by the agent), then publish the
 * kit so the buyer can see it and the referee can score it. */
async function joinBounty(ctx: Ctx, bountyRowId: string, log: (msg: string) => void): Promise<string> {
  const { data: row } = await ctx.supabase
    .from("bounties")
    .select("*")
    .eq("id", bountyRowId)
    .single<BountyRow>();
  if (!row) throw new Error(`no bounty row found for id ${bountyRowId}`);
  if (row.status !== "open") throw new Error(`bounty is "${row.status}", not open`);
  if (!row.deadline || Date.now() >= new Date(row.deadline).getTime()) {
    throw new Error("bounty's submission deadline has already passed");
  }
  const brief = BriefSchema.parse(row.brief);
  const buyerPubkey = new PublicKey(row.buyer!);
  log(`joining "${brief.businessName}" (buyer ${buyerPubkey.toBase58().slice(0, 6)}…)`);

  await ensureFunded(ctx);

  const kit = await generateBrandKit(MY_AGENT_PERSONA, brief, "my-agent");
  log(`designed "${kit.names[0]}"`);

  // Commit first, publish second: the on-chain hash is what proves the kit
  // we publish is the one this agent actually entered.
  const submitIx = await buildSubmitEntryIx(ctx.program, {
    agent: ctx.myAgent.publicKey,
    buyer: buyerPubkey,
    bountyId: BigInt(row.bounty_id!),
    contentHash: Buffer.from(hash(kit), "hex"),
  });
  const submitSig = await sendSignedInstruction(ctx.connection, submitIx, ctx.myAgent);
  log(`submitted on-chain — ${explorerTx(submitSig)}`);

  const publishRes = await postJson(ctx.baseUrl, `/api/bounties/${bountyRowId}/entries`, {
    agentPubkey: ctx.myAgent.publicKey.toBase58(),
    kit,
  });
  if (publishRes.status !== 201) {
    throw new Error(`publish failed (${publishRes.status}): ${JSON.stringify(publishRes.json)}`);
  }
  log("kit published");
  return `${ctx.baseUrl}/b/${bountyRowId}`;
}

/** Non-stop: watch the mission board and join every new bounty, several at
 * once if needed. One failed join is logged and never stops the loop. */
async function runForever(ctx: Ctx): Promise<never> {
  const since = new Date().toISOString();
  const seen = new Set<string>();
  const stamp = () => new Date().toLocaleTimeString();
  console.log(`[${stamp()}] watching the mission board non-stop — Ctrl+C (or npm run agent:david:stop) to stop`);

  for (;;) {
    try {
      const { data } = await ctx.supabase
        .from("bounties")
        .select("id,deadline")
        .eq("status", "open")
        .gt("created_at", since)
        .order("created_at", { ascending: true })
        .returns<Array<{ id: string; deadline: string | null }>>();
      for (const b of data ?? []) {
        if (seen.has(b.id)) continue;
        seen.add(b.id);
        const short = b.id.slice(0, 8);
        const log = (msg: string) => console.log(`[${stamp()}] ${short}: ${msg}`);
        log("spotted a new bounty");
        joinBounty(ctx, b.id, log).catch((err) =>
          log(`FAILED — ${err instanceof Error ? err.message : String(err)}`),
        );
      }
    } catch (err) {
      console.log(`[${stamp()}] poll error (will retry): ${err instanceof Error ? err.message : String(err)}`);
    }
    await new Promise((r) => setTimeout(r, WATCH_POLL_MS));
  }
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const args = parseArgs(process.argv.slice(2));
  const { baseUrl, deadlineSecs, pickWindowSecs, watch, loop } = args;
  let bountyAddress = args.bountyAddress;
  const serverEnv = getServerEnv();
  const publicEnv = getPublicEnv();

  if (publicEnv.NEXT_PUBLIC_CLUSTER !== "devnet") {
    console.error(`my-agent-demo refuses to run: NEXT_PUBLIC_CLUSTER is "${publicEnv.NEXT_PUBLIC_CLUSTER}", not "devnet".`);
    process.exit(1);
  }

  const connection = getConnection(serverEnv.SOLANA_RPC_URL);
  const ctx: Ctx = {
    baseUrl,
    connection,
    program: getProgram(connection),
    supabase: createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY),
    myAgent: loadOrCreateMyAgentKeypair(),
  };

  console.log(`My agent's wallet (safe to share — this is a public key, not a secret):`);
  console.log(`  ${ctx.myAgent.publicKey.toBase58()}`);
  console.log(`  ${explorerAddress(ctx.myAgent.publicKey.toBase58())}\n`);

  if (loop) {
    await ensureFunded(ctx);
    await runForever(ctx);
  }

  if (watch) {
    console.log("=== Watching the mission board for the next new bounty... ===");
    bountyAddress = await waitForNewBounty(ctx.supabase, startedAt);
    console.log(`  spotted ${bountyAddress}`);
  }

  if (!bountyAddress) {
    const deployer = loadDeployerKeypair();
    const now = Math.floor(Date.now() / 1000);
    const newBountyId = BigInt(Date.now());

    console.log("=== Creating bounty on-chain (deployer as buyer — NOT suitable for a live demo) ===");
    const createProgram = getProgram(connection, deployer);
    const [bountyPda] = findBountyPda(deployer.publicKey, newBountyId, createProgram.programId);
    const createIx = await buildCreateBountyIx(createProgram, {
      buyer: deployer.publicKey,
      mint: new PublicKey(devnetConfig.mint),
      bountyId: newBountyId,
      amount: BRIEF.prizeTusdc * 1_000_000,
      deadline: now + deadlineSecs,
      pickWindowSecs,
      briefHash: Buffer.from(hash(BRIEF), "hex"),
    });
    const createSig = await sendSignedInstruction(connection, createIx, deployer);
    console.log(`  bounty ${bountyPda.toBase58()} — ${explorerTx(createSig)}`);

    const registerRes = await postJson(baseUrl, "/api/bounties", {
      address: bountyPda.toBase58(),
      txSig: createSig,
      brief: BRIEF,
    });
    if (registerRes.status !== 201) {
      throw new Error(`register failed (${registerRes.status}): ${JSON.stringify(registerRes.json)}`);
    }
    bountyAddress = registerRes.json.id as string;

    // Fire-and-forget, same as /new does client-side — awaiting these one by
    // one (15-45s each) could eat the deadline before our own submission.
    for (const agent of AGENTS) {
      postJson(baseUrl, `/api/bounties/${bountyAddress}/run/${agent}`, {}).catch(() => {});
    }
    console.log("  fired the 3 built-in agents");
  }

  const url = await joinBounty(ctx, bountyAddress, (msg) => console.log(`  ${msg}`));

  console.log(`\nOpen this and pick it (only works if you're connected as the buyer wallet that posted it):`);
  console.log(`  ${url}`);
  console.log(`\nThen check the payout by pasting this address into ${baseUrl}/agent:`);
  console.log(`  ${ctx.myAgent.publicKey.toBase58()}`);
}

main().catch((err) => {
  console.error("\nmy-agent-demo FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
