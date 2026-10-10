// "Agent of David" — a complete outside agent, the reference for
// /connect. It uses ONLY what any developer gets: the public mission feed
// (GET /api/missions), the on-chain program (submit_entry, signed with its own
// key), and the publish endpoint (POST /api/bounties/[id]/entries). It never
// touches our database. Its kit comes from its own creative direction below.
//
// Modes:
//   --loop                NON-STOP: enter every open mission it hasn't
//     entered yet, forever (several at once if needed), topping up its own
//     gas. Run detached with `npm run agent:david:start`.
//   --watch               enter only the next new mission, then exit.
//   --bounty <row id>     enter one specific mission (the id in /b/<id>).
//   (none)                test mode: CREATE a bounty too (buyer = deployer
//     keypair) and enter it. Not for live demos — only the real buyer can
//     pick, and here that's a script key.
//   --connect <code>      first link this agent to a developer's account
//     (the one-time code from Dashboard → Your agents). Combinable with any
//     mode above.
//
// Usage:
//   npx tsx scripts/my-agent-demo.ts --loop --connect BB-XXXX-XXXX-XX
//   npx tsx scripts/my-agent-demo.ts --bounty <id>
//   npx tsx scripts/my-agent-demo.ts --base-url http://localhost:3000
import { config } from "dotenv";
import { createPrivateKey, sign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import bs58 from "bs58";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { getPublicEnv, getServerEnv } from "../src/lib/env";
import { hash } from "../src/lib/hash";
import { BriefSchema, type Brief } from "../src/lib/agents/schema";
import { generateBrandKit } from "../src/lib/agents/run-agent";
import { connectAgentMessage } from "../src/lib/auth/messages";
import {
  buildCreateBountyIx,
  buildSubmitEntryIx,
  explorerAddress,
  explorerTx,
  fetchEntry,
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
// The feed allows 60 req/min per IP; every 3s is 20/min.
const POLL_MS = 3_000;
const WATCH_TIMEOUT_MS = 15 * 60_000;
// Designing + committing takes ~20-45s; don't start a mission that closes sooner.
const MIN_SECONDS_LEFT = 45;

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

/** One entry of GET /api/missions. */
interface Mission {
  id: string;
  bountyAddress: string;
  buyer: string;
  bountyId: string;
  deadline: string;
  brief: unknown;
  publishKitUrl: string;
}

interface Ctx {
  baseUrl: string;
  connection: ReturnType<typeof getConnection>;
  program: ReturnType<typeof getProgram>;
  myAgent: Keypair;
}

function loadDeployerKeypair(): Keypair {
  const path = resolve(homedir(), ".config/solana/id.json");
  const raw = readFileSync(path, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
}

/** Idempotent: reuses the same agent wallet across runs, so its on-chain
 * history accumulates and its account link stays valid. */
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

/** ed25519 over the exact message bytes — what any Solana wallet produces. */
function signWithKeypair(kp: Keypair, message: string): string {
  const key = createPrivateKey({
    key: {
      kty: "OKP",
      crv: "Ed25519",
      d: Buffer.from(kp.secretKey.slice(0, 32)).toString("base64url"),
      x: Buffer.from(kp.publicKey.toBytes()).toString("base64url"),
    },
    format: "jwk",
  });
  return bs58.encode(sign(null, Buffer.from(message, "utf8"), key));
}

function parseArgs(argv: string[]) {
  let baseUrl = DEFAULT_BASE_URL;
  let deadlineSecs = 300;
  let pickWindowSecs = 600;
  let bountyId: string | null = null;
  let connectCode: string | null = null;
  let watch = false;
  let loop = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base-url" && argv[i + 1]) baseUrl = argv[++i];
    else if (argv[i] === "--deadline-secs" && argv[i + 1]) deadlineSecs = Number(argv[++i]);
    else if (argv[i] === "--pick-window-secs" && argv[i + 1]) pickWindowSecs = Number(argv[++i]);
    else if (argv[i] === "--bounty" && argv[i + 1]) bountyId = argv[++i];
    else if (argv[i] === "--connect" && argv[i + 1]) connectCode = argv[++i];
    else if (argv[i] === "--watch") watch = true;
    else if (argv[i] === "--loop") loop = true;
  }
  return { baseUrl, deadlineSecs, pickWindowSecs, bountyId, connectCode, watch, loop };
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json: json as Record<string, unknown> };
}

async function fetchMissions(baseUrl: string): Promise<Mission[]> {
  const res = await fetch(`${baseUrl}/api/missions`);
  if (!res.ok) throw new Error(`mission feed ${res.status}`);
  return ((await res.json()) as { missions: Mission[] }).missions;
}

/** Links this agent to a developer's account: sign the one-time code with
 * the agent's own key and send it. */
async function connect(ctx: Ctx, code: string): Promise<void> {
  const agentPubkey = ctx.myAgent.publicKey.toBase58();
  const normalized = code.trim().toUpperCase();
  const res = await postJson(`${ctx.baseUrl}/api/agents/connect`, {
    code: normalized,
    agentPubkey,
    signature: signWithKeypair(ctx.myAgent, connectAgentMessage(normalized, agentPubkey)),
  });
  if (res.status === 200) {
    const agent = res.json.agent as { name: string; owner: string };
    console.log(`Connected as "${agent.name}" (owner ${agent.owner.slice(0, 6)}…)\n`);
  } else {
    console.log(`Connect: ${res.status} ${JSON.stringify(res.json)} — continuing anyway\n`);
  }
}

const MIN_LAMPORTS = 0.01 * 1e9;
const TOP_UP_LAMPORTS = 0.05 * 1e9;
let fundingInFlight: Promise<void> | null = null;

/** Each entry costs the agent the Entry account's rent + the fee, so top it
 * up from the deployer whenever it runs low. Serialized so concurrent joins
 * don't each send a top-up. */
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

/** The agent's whole job on one mission: design a kit, commit its hash
 * on-chain (submit_entry, signed by the agent), then publish the kit. Returns
 * false if it skipped (already entered, or too little time left). */
async function joinMission(ctx: Ctx, m: Mission, log: (msg: string) => void): Promise<boolean> {
  const secondsLeft = (new Date(m.deadline).getTime() - Date.now()) / 1000;
  if (secondsLeft < MIN_SECONDS_LEFT) {
    log(`skipped — only ${Math.round(secondsLeft)}s left`);
    return false;
  }
  const bounty = new PublicKey(m.bountyAddress);
  if (await fetchEntry(ctx.program, bounty, ctx.myAgent.publicKey)) {
    log("already entered — skipping");
    return false;
  }

  const brief = BriefSchema.parse(m.brief);
  log(`entering "${brief.businessName}" (buyer ${m.buyer.slice(0, 6)}…)`);
  await ensureFunded(ctx);

  const kit = await generateBrandKit(MY_AGENT_PERSONA, brief, "my-agent");
  log(`designed "${kit.names[0]}"`);

  // Commit first, publish second: the on-chain hash is what proves the kit
  // we publish is the one this agent actually entered.
  const submitIx = await buildSubmitEntryIx(ctx.program, {
    agent: ctx.myAgent.publicKey,
    buyer: new PublicKey(m.buyer),
    bountyId: BigInt(m.bountyId),
    contentHash: Buffer.from(hash(kit), "hex"),
  });
  const submitSig = await sendSignedInstruction(ctx.connection, submitIx, ctx.myAgent);
  log(`committed on-chain — ${explorerTx(submitSig)}`);

  const publishRes = await postJson(`${ctx.baseUrl}${m.publishKitUrl}`, {
    agentPubkey: ctx.myAgent.publicKey.toBase58(),
    kit,
  });
  if (publishRes.status !== 201) {
    throw new Error(`publish failed (${publishRes.status}): ${JSON.stringify(publishRes.json)}`);
  }
  log("kit published");
  return true;
}

/** Non-stop: enter every open mission not yet entered, forever. One failed
 * mission is logged and never stops the loop. */
async function runForever(ctx: Ctx): Promise<never> {
  const handled = new Set<string>();
  const stamp = () => new Date().toLocaleTimeString();
  console.log(`[${stamp()}] watching the mission board non-stop — npm run agent:david:stop to stop`);

  for (;;) {
    try {
      for (const m of await fetchMissions(ctx.baseUrl)) {
        if (handled.has(m.id)) continue;
        handled.add(m.id);
        const short = m.id.slice(0, 8);
        const log = (msg: string) => console.log(`[${stamp()}] ${short}: ${msg}`);
        joinMission(ctx, m, log).catch((err) =>
          log(`FAILED — ${err instanceof Error ? err.message : String(err)}`),
        );
      }
    } catch (err) {
      console.log(`[${stamp()}] feed error (will retry): ${err instanceof Error ? err.message : String(err)}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/** Waits for a mission that wasn't open when we started, and returns it. */
async function waitForNewMission(ctx: Ctx): Promise<Mission> {
  const existing = new Set((await fetchMissions(ctx.baseUrl)).map((m) => m.id));
  const giveUpAt = Date.now() + WATCH_TIMEOUT_MS;
  while (Date.now() < giveUpAt) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const fresh = (await fetchMissions(ctx.baseUrl)).find((m) => !existing.has(m.id));
    if (fresh) return fresh;
  }
  throw new Error("no new mission was posted within 15 minutes");
}

async function findMission(ctx: Ctx, id: string): Promise<Mission> {
  const m = (await fetchMissions(ctx.baseUrl)).find((x) => x.id === id);
  if (!m) throw new Error(`mission ${id} isn't open (closed, settled, or unknown)`);
  return m;
}

/** Test mode: create + register a bounty (buyer = deployer) and fire our 3
 * built-in agents at it, then return its row id. */
async function createTestBounty(ctx: Ctx, deadlineSecs: number, pickWindowSecs: number): Promise<string> {
  const deployer = loadDeployerKeypair();
  const createProgram = getProgram(ctx.connection, deployer);
  const newBountyId = BigInt(Date.now());
  const [bountyPda] = findBountyPda(deployer.publicKey, newBountyId, createProgram.programId);
  const createIx = await buildCreateBountyIx(createProgram, {
    buyer: deployer.publicKey,
    mint: new PublicKey(devnetConfig.mint),
    bountyId: newBountyId,
    amount: BRIEF.prizeTusdc * 1_000_000,
    deadline: Math.floor(Date.now() / 1000) + deadlineSecs,
    pickWindowSecs,
    briefHash: Buffer.from(hash(BRIEF), "hex"),
  });
  const createSig = await sendSignedInstruction(ctx.connection, createIx, deployer);
  console.log(`Test bounty ${bountyPda.toBase58()} (buyer = deployer) — ${explorerTx(createSig)}`);

  const registerRes = await postJson(`${ctx.baseUrl}/api/bounties`, {
    address: bountyPda.toBase58(),
    txSig: createSig,
    brief: BRIEF,
  });
  if (registerRes.status !== 201) {
    throw new Error(`register failed (${registerRes.status}): ${JSON.stringify(registerRes.json)}`);
  }
  const id = registerRes.json.id as string;
  for (const agent of AGENTS) {
    postJson(`${ctx.baseUrl}/api/bounties/${id}/run/${agent}`, {}).catch(() => {});
  }
  return id;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (getPublicEnv().NEXT_PUBLIC_CLUSTER !== "devnet") {
    console.error("my-agent-demo refuses to run: NEXT_PUBLIC_CLUSTER is not \"devnet\".");
    process.exit(1);
  }

  const connection = getConnection(getServerEnv().SOLANA_RPC_URL);
  const ctx: Ctx = {
    baseUrl: args.baseUrl,
    connection,
    program: getProgram(connection),
    myAgent: loadOrCreateMyAgentKeypair(),
  };

  console.log(`Agent wallet (public, safe to share): ${ctx.myAgent.publicKey.toBase58()}`);
  console.log(`  ${explorerAddress(ctx.myAgent.publicKey.toBase58())}\n`);

  if (args.connectCode) await connect(ctx, args.connectCode);

  if (args.loop) {
    await ensureFunded(ctx);
    await runForever(ctx);
  }

  let mission: Mission;
  if (args.bountyId) {
    mission = await findMission(ctx, args.bountyId);
  } else if (args.watch) {
    console.log("Watching for the next new mission...");
    mission = await waitForNewMission(ctx);
  } else {
    mission = await findMission(ctx, await createTestBounty(ctx, args.deadlineSecs, args.pickWindowSecs));
  }

  await joinMission(ctx, mission, (msg) => console.log(`  ${msg}`));
  console.log(`\n${ctx.baseUrl}/b/${mission.id}`);
}

main().catch((err) => {
  console.error("\nmy-agent-demo FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
