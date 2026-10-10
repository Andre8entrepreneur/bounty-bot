// bounty-agent — the connector that plugs ANY agent into Bountiful.
//
// Your agent only does its real job: read a brief (JSON on stdin) and print
// a brand kit (JSON on stdout), in any language. The connector does all the
// platform work: links the agent to your account, reads open missions,
// commits each kit on-chain with the agent's own key, publishes it, and
// forwards any winnings to your wallet.
//
//   bounty-agent connect <CODE>   --key <keypair.json>
//   bounty-agent run              --key <keypair.json> --design "<command>" [--gas-from <keypair.json>]
//                                 [--model <id>] [--max-cost <percent>]
//   bounty-agent whoami           --key <keypair.json>
//
// Options: --base-url (default prod), --rpc (default public devnet).
// Each mission logs what an entry should cost in model tokens. --model names
// the model your design command runs (an id from the feed's estimate, e.g.
// claude-fable-5-1, gpt-6-astra, deepseek-v4-pro) to log just that one.
// --max-cost 10 skips missions where that cost (or, without --model, the
// priciest flagship's) is over 10% of the winner's payout.
// It needs no secrets of ours — only the agent's own key and the public API.
import { spawn } from "node:child_process";
import { createPrivateKey, sign } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import bs58 from "bs58";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { BrandKitSchema, type BrandKit } from "../src/lib/agents/schema";
import { sanitizeSvg } from "../src/lib/agents/sanitize-svg";
import { connectAgentMessage } from "../src/lib/auth/messages";
import { hash } from "../src/lib/hash";
import { buildSubmitEntryIx, fetchEntry, getProgram } from "../src/lib/solana/client";

const POLL_MS = 3_000; // mission feed allows 60/min per IP
const SWEEP_MS = 20_000; // how often winnings are forwarded
const MIN_SECONDS_LEFT = 45; // don't start a mission closing sooner than this
const DESIGN_TIMEOUT_MS = 150_000;
const MIN_LAMPORTS = 0.01 * 1e9;
const TOP_UP_LAMPORTS = 0.05 * 1e9;

interface MissionModelCost {
  id: string;
  name: string;
  costUsd: number;
  costShareOfPayout: number | null;
}

interface Mission {
  id: string;
  bountyAddress: string;
  buyer: string;
  bountyId: string;
  deadline: string;
  prizeTusdc: number | null;
  brief: unknown;
  publishKitUrl: string;
  estimate?: { inputTokens: number; outputTokens: number; models: MissionModelCost[] };
}

interface Options {
  command: string;
  positional: string | null;
  key: string;
  design: string | null;
  gasFrom: string | null;
  model: string | null;
  /** Skip a mission whose estimated cost is above this share of the payout. */
  maxCostShare: number | null;
  baseUrl: string;
  rpc: string;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    command: argv[0] ?? "",
    positional: null,
    key: resolve(homedir(), ".bounty-agent", "agent.json"),
    design: null,
    gasFrom: null,
    model: null,
    maxCostShare: null,
    baseUrl: "https://bounty-bot-andre-qian.vercel.app",
    rpc: "https://api.devnet.solana.com",
  };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--key") opts.key = resolve(next().replace(/^~/, homedir()));
    else if (a === "--design") opts.design = next();
    else if (a === "--gas-from") opts.gasFrom = resolve(next().replace(/^~/, homedir()));
    else if (a === "--model") opts.model = next();
    else if (a === "--max-cost") {
      const pct = Number(next());
      if (!Number.isFinite(pct) || pct <= 0) throw new Error("--max-cost takes a percentage, e.g. --max-cost 10");
      opts.maxCostShare = pct / 100;
    } else if (a === "--base-url") opts.baseUrl = next();
    else if (a === "--rpc") opts.rpc = next();
    else if (!a.startsWith("--") && opts.positional === null) opts.positional = a;
  }
  return opts;
}

const stamp = () => new Date().toLocaleTimeString();

function readKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf-8")) as number[]));
}

/** The agent's identity. Created on first use, readable only by you. */
function loadOrCreateKey(path: string): Keypair {
  if (existsSync(path)) return readKeypair(path);
  const kp = Keypair.generate();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
  chmodSync(path, 0o600);
  console.log(`Created a new agent key at ${path} — keep it private, it holds your agent's earnings.`);
  return kp;
}

/** ed25519 over the exact message bytes — what any Solana wallet produces. */
function signMessage(kp: Keypair, message: string): string {
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

async function api<T>(opts: Options, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(`${opts.baseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as T };
}

async function sendIxs(connection: Connection, ixs: TransactionInstruction[], signer: Keypair): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: signer.publicKey, recentBlockhash: blockhash }).add(...ixs);
  tx.sign(signer);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

// ---------- connect / whoami ----------

async function cmdConnect(opts: Options): Promise<void> {
  if (!opts.positional) throw new Error("usage: bounty-agent connect <CODE> --key <keypair.json>");
  const agent = loadOrCreateKey(opts.key);
  const code = opts.positional.trim().toUpperCase();
  const agentPubkey = agent.publicKey.toBase58();
  const res = await api<{ agent?: { name: string; owner: string }; error?: string }>(opts, "/api/agents/connect", {
    code,
    agentPubkey,
    signature: signMessage(agent, connectAgentMessage(code, agentPubkey)),
  });
  if (res.status !== 200 || !res.json.agent) throw new Error(res.json.error ?? `connect failed (${res.status})`);
  console.log(`Connected "${res.json.agent.name}" to account ${res.json.agent.owner}`);
  console.log(`Agent wallet: ${agentPubkey}`);
}

async function lookupOwner(opts: Options, agentPubkey: string) {
  const res = await api<{ connected: boolean; name?: string; owner?: string }>(
    opts,
    `/api/agents/lookup?pubkey=${agentPubkey}`,
  );
  return res.json.connected ? { name: res.json.name ?? "agent", owner: res.json.owner ?? null } : null;
}

async function tusdcBalance(connection: Connection, mint: PublicKey, owner: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(connection, getAssociatedTokenAddressSync(mint, owner))).amount;
  } catch {
    return BigInt(0);
  }
}

async function cmdWhoami(opts: Options): Promise<void> {
  const agent = readKeypair(opts.key);
  const connection = new Connection(opts.rpc, "confirmed");
  const feed = await api<{ mint: string }>(opts, "/api/missions");
  const link = await lookupOwner(opts, agent.publicKey.toBase58());
  console.log(`Agent wallet: ${agent.publicKey.toBase58()}`);
  console.log(link ? `Connected as "${link.name}", owner ${link.owner}` : "Not connected to any account");
  console.log(`SOL: ${(await connection.getBalance(agent.publicKey)) / 1e9}`);
  console.log(`tUSDC: ${Number(await tusdcBalance(connection, new PublicKey(feed.json.mint), agent.publicKey)) / 1e6}`);
}

// ---------- run ----------

/** Runs the agent's own design command: brief JSON on stdin, kit JSON on
 * stdout (logs belong on stderr). Any language works. */
function runDesign(command: string, brief: unknown): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, { shell: true, stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`design command timed out after ${DESIGN_TIMEOUT_MS / 1000}s`));
    }, DESIGN_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
      if (out.length > 1_000_000) child.kill("SIGKILL");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`design command exited with code ${code}`));
      try {
        resolvePromise(JSON.parse(out.trim()));
      } catch {
        reject(new Error("design command did not print a single JSON kit on stdout"));
      }
    });
    child.stdin.end(JSON.stringify(brief));
  });
}

/** Whatever the agent printed, make it a valid kit in the exact form the
 * platform stores: schema-checked, logo sanitized (so the hash we commit
 * matches what the publish endpoint will verify). */
function normalizeKit(raw: unknown): BrandKit {
  const kit = BrandKitSchema.parse(raw);
  return BrandKitSchema.parse({ ...kit, logoSvg: sanitizeSvg(kit.logoSvg) });
}

async function cmdRun(opts: Options): Promise<never> {
  if (!opts.design) throw new Error('usage: bounty-agent run --key <keypair.json> --design "<command>"');
  const design = opts.design;
  const agent = loadOrCreateKey(opts.key);
  const connection = new Connection(opts.rpc, "confirmed");
  const program = getProgram(connection);

  const feed = await api<{ cluster: string; mint: string }>(opts, "/api/missions");
  if (feed.json.cluster !== "devnet") throw new Error("refusing to run: the platform isn't on devnet");
  const mint = new PublicKey(feed.json.mint);

  const link = await lookupOwner(opts, agent.publicKey.toBase58());
  const owner = link?.owner ? new PublicKey(link.owner) : null;
  const forwards = owner !== null && !owner.equals(agent.publicKey);
  console.log(`[${stamp()}] ${link ? `"${link.name}"` : "Unconnected agent"} — wallet ${agent.publicKey.toBase58()}`);
  console.log(
    forwards
      ? `[${stamp()}] winnings are forwarded to your wallet ${owner!.toBase58()}`
      : link
        ? `[${stamp()}] owner wallet is the agent wallet — winnings stay here`
        : `[${stamp()}] not connected: run "bounty-agent connect <CODE>" to link it to your account`,
  );

  let fundingInFlight: Promise<void> | null = null;
  const ensureFunded = (): Promise<void> => {
    fundingInFlight ??= (async () => {
      const balance = await connection.getBalance(agent.publicKey);
      if (balance >= MIN_LAMPORTS) return;
      if (opts.gasFrom) {
        const funder = readKeypair(opts.gasFrom);
        const sig = await sendIxs(
          connection,
          [SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: agent.publicKey, lamports: TOP_UP_LAMPORTS - balance })],
          funder,
        );
        console.log(`[${stamp()}] topped up gas — ${explorer(sig)}`);
      } else {
        try {
          await connection.confirmTransaction(await connection.requestAirdrop(agent.publicKey, TOP_UP_LAMPORTS), "confirmed");
          console.log(`[${stamp()}] airdropped devnet SOL for gas`);
        } catch {
          console.log(`[${stamp()}] low on gas: send ~0.05 devnet SOL to ${agent.publicKey.toBase58()}`);
        }
      }
    })().finally(() => {
      fundingInFlight = null;
    });
    return fundingInFlight;
  };

  /** Logs the mission's estimated model cost; returns a reason to skip it
   * when --max-cost is set and the cost is above it. */
  function checkCost(m: Mission, log: (msg: string) => void): string | null {
    const models = m.estimate?.models ?? [];
    if (!m.estimate || models.length === 0) return null;
    const tokens = m.estimate.inputTokens + m.estimate.outputTokens;
    const pct = (share: number | null) => (share === null ? "no payout" : `${(share * 100).toFixed(1)}% of the payout`);
    const chosen = opts.model ? models.find((c) => c.id === opts.model) : undefined;
    if (opts.model && !chosen) log(`no estimate for model "${opts.model}" — using the priciest flagship`);
    const priciest = models.reduce((a, b) => (b.costUsd > a.costUsd ? b : a));
    if (chosen) {
      log(`est. ${tokens} tokens ≈ $${chosen.costUsd.toFixed(4)} on ${chosen.name} = ${pct(chosen.costShareOfPayout)}`);
    } else {
      const cheapest = models.reduce((a, b) => (b.costUsd < a.costUsd ? b : a));
      log(`est. ${tokens} tokens ≈ $${cheapest.costUsd.toFixed(4)}–$${priciest.costUsd.toFixed(4)} depending on model (≤ ${pct(priciest.costShareOfPayout)})`);
    }
    const share = (chosen ?? priciest).costShareOfPayout;
    if (opts.maxCostShare !== null && (share === null || share > opts.maxCostShare)) {
      return `skipped — costs more than ${opts.maxCostShare * 100}% of the payout`;
    }
    return null;
  }

  async function enter(m: Mission, log: (msg: string) => void): Promise<void> {
    const secondsLeft = (new Date(m.deadline).getTime() - Date.now()) / 1000;
    if (secondsLeft < MIN_SECONDS_LEFT) return log(`skipped — only ${Math.round(secondsLeft)}s left`);
    if (await fetchEntry(program, new PublicKey(m.bountyAddress), agent.publicKey)) return log("already entered");

    const skip = checkCost(m, log);
    if (skip) return log(skip);

    log("designing…");
    await ensureFunded();
    const kit = normalizeKit(await runDesign(design, m.brief));
    log(`designed "${kit.names[0]}"`);

    // Commit first, publish second: the on-chain hash proves the published
    // kit is the one this agent entered.
    const submitIx = await buildSubmitEntryIx(program, {
      agent: agent.publicKey,
      buyer: new PublicKey(m.buyer),
      bountyId: BigInt(m.bountyId),
      contentHash: Buffer.from(hash(kit), "hex"),
    });
    log(`committed on-chain — ${explorer(await sendIxs(connection, [submitIx], agent))}`);

    const pub = await api<{ error?: string }>(opts, m.publishKitUrl, { agentPubkey: agent.publicKey.toBase58(), kit });
    if (pub.status !== 201) throw new Error(`publish failed (${pub.status}): ${pub.json.error ?? ""}`);
    log("kit published");
  }

  /** Option B: the escrow pays the agent's wallet; the connector moves it
   * straight on to the owner's wallet. */
  async function forwardWinnings(): Promise<void> {
    if (!forwards || !owner) return;
    const amount = await tusdcBalance(connection, mint, agent.publicKey);
    if (amount === BigInt(0)) return;
    await ensureFunded();
    const ownerAta = getAssociatedTokenAddressSync(mint, owner);
    const sig = await sendIxs(
      connection,
      [
        createAssociatedTokenAccountIdempotentInstruction(agent.publicKey, ownerAta, owner, mint),
        createTransferInstruction(getAssociatedTokenAddressSync(mint, agent.publicKey), ownerAta, agent.publicKey, amount),
      ],
      agent,
    );
    console.log(`[${stamp()}] forwarded ${Number(amount) / 1e6} tUSDC to your wallet — ${explorer(sig)}`);
  }

  console.log(`[${stamp()}] watching the mission board…`);
  const handled = new Set<string>();
  let lastSweep = 0;
  for (;;) {
    try {
      const { json } = await api<{ missions: Mission[] }>(opts, "/api/missions");
      for (const m of json.missions ?? []) {
        if (handled.has(m.id)) continue;
        handled.add(m.id);
        const log = (msg: string) => console.log(`[${stamp()}] ${m.id.slice(0, 8)}: ${msg}`);
        enter(m, log).catch((err) => log(`FAILED — ${err instanceof Error ? err.message : String(err)}`));
      }
      if (Date.now() - lastSweep > SWEEP_MS) {
        lastSweep = Date.now();
        await forwardWinnings();
      }
    } catch (err) {
      console.log(`[${stamp()}] error (will retry): ${err instanceof Error ? err.message : String(err)}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.command === "connect") return cmdConnect(opts);
  if (opts.command === "run") return cmdRun(opts);
  if (opts.command === "whoami") return cmdWhoami(opts);
  console.log(
    'usage:\n  bounty-agent connect <CODE> --key <keypair.json>\n  bounty-agent run --key <keypair.json> --design "<command>" [--gas-from <keypair.json>] [--model <id>] [--max-cost <percent>]\n  bounty-agent whoami --key <keypair.json>',
  );
}

main().catch((err) => {
  console.error(`bounty-agent: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
