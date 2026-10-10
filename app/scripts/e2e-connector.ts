// End-to-end test of the bounty-agent connector against a live app:
// a developer signs in and registers an agent; the connector links a fresh
// agent key with the one-time code, enters a test bounty with a real brain,
// the buyer picks it, and the winnings must land in the developer's wallet
// (forwarded by the connector — the escrow pays the agent wallet). Cleans up
// its registry row.
//
// Usage: npx tsx scripts/e2e-connector.ts [--base-url https://…]
import { config } from "dotenv";
import { spawn, type ChildProcess } from "node:child_process";
import { createPrivateKey, sign } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import bs58 from "bs58";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv, getServerEnv } from "../src/lib/env";
import { signInMessage } from "../src/lib/auth/messages";
import { hash } from "../src/lib/hash";
import type { Brief } from "../src/lib/agents/schema";
import {
  buildCreateBountyIx,
  buildPickWinnerIx,
  explorerTx,
  findBountyPda,
  getConnection,
  getProgram,
  sendSignedInstruction,
} from "../src/lib/solana/client";
import devnetConfig from "../src/config/devnet.json";

config({ path: resolve(process.cwd(), ".env.local"), override: true });

const argIndex = process.argv.indexOf("--base-url");
const BASE = argIndex > 0 ? process.argv[argIndex + 1] : "https://bounty-bot-andre-qian.vercel.app";
const PRIZE = 10_000_000;
const PAYOUT = BigInt(9_000_000); // 90%

const BRIEF: Brief = {
  businessName: "Kumo Tea",
  whatItDoes: "A tiny tea bar serving single-origin Japanese green teas.",
  audience: "Calm-seeking office workers on their lunch break",
  vibe: ["calm", "premium"],
  mustHaves: ["a tea leaf in the logo"],
  minScore: 40,
  prizeTusdc: 10,
  deadlinePreset: "demo",
};

let failures = 0;
function check(ok: boolean, label: string, detail?: unknown) {
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${ok ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function walletSign(kp: Keypair, message: string): string {
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

async function call(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown>, setCookie: res.headers.get("set-cookie") };
}

function connector(args: string[], onLine?: (line: string) => void): ChildProcess {
  const child = spawn("npx", ["tsx", "scripts/bounty-agent.ts", ...args, "--base-url", BASE], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const forward = (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n").filter(Boolean)) {
      console.log(`    [connector] ${line}`);
      onLine?.(line);
    }
  };
  child.stdout?.on("data", forward);
  child.stderr?.on("data", forward);
  return child;
}

async function tusdc(connection: ReturnType<typeof getConnection>, owner: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(connection, getAssociatedTokenAddressSync(new PublicKey(devnetConfig.mint), owner))).amount;
  } catch {
    return BigInt(0);
  }
}

async function main() {
  const supabase = createClient(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SERVICE_ROLE_KEY);
  const connection = getConnection(getServerEnv().SOLANA_RPC_URL);
  const deployer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(resolve(homedir(), ".config/solana/id.json"), "utf-8")) as number[]),
  );
  const developer = Keypair.generate();
  const agentKeyPath = join(mkdtempSync(join(tmpdir(), "bounty-agent-")), "agent.json");
  let runner: ChildProcess | null = null;
  let bountyRowId: string | null = null;
  console.log(`Testing against ${BASE}\n`);

  try {
    console.log("1. Developer signs in and registers an agent");
    const { json: n } = await call("POST", "/api/auth/nonce", {});
    const login = await call("POST", "/api/auth/login", {
      pubkey: developer.publicKey.toBase58(),
      nonce: n.nonce,
      signature: walletSign(developer, signInMessage(developer.publicKey.toBase58(), n.nonce as string)),
    });
    const cookie = login.setCookie?.split(";")[0] ?? "";
    const created = await call("POST", "/api/agents", { name: "Connector Test Agent", specialty: "Test" }, cookie);
    check(created.status === 201, "agent registered, code issued", created.json);
    const code = created.json.code as string;

    console.log("\n2. Connector links a fresh agent key with the code");
    const linked = await new Promise<number>((done) => connector(["connect", code, "--key", agentKeyPath]).on("close", done));
    check(linked === 0, "bounty-agent connect succeeded");
    const agent = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(agentKeyPath, "utf-8")) as number[]));
    const lookup = await call("GET", `/api/agents/lookup?pubkey=${agent.publicKey.toBase58()}`);
    check(
      lookup.json.connected === true && lookup.json.owner === developer.publicKey.toBase58(),
      "registry shows the agent owned by the developer",
      lookup.json,
    );

    console.log("\n3. A test bounty is posted (buyer = deployer)");
    const program = getProgram(connection, deployer);
    const bountyId = BigInt(Date.now());
    const [bountyPda] = findBountyPda(deployer.publicKey, bountyId, program.programId);
    const deadline = Math.floor(Date.now() / 1000) + 100;
    const createSig = await sendSignedInstruction(
      connection,
      await buildCreateBountyIx(program, {
        buyer: deployer.publicKey,
        mint: new PublicKey(devnetConfig.mint),
        bountyId,
        amount: PRIZE,
        deadline,
        pickWindowSecs: 180,
        briefHash: Buffer.from(hash(BRIEF), "hex"),
      }),
      deployer,
    );
    const reg = await call("POST", "/api/bounties", { address: bountyPda.toBase58(), txSig: createSig, brief: BRIEF });
    check(reg.status === 201, "bounty registered", reg.json);
    bountyRowId = reg.json.id as string;
    const rowId = bountyRowId;
    console.log(`    ${BASE}/b/${rowId}`);

    console.log("\n4. Connector runs the agent's brain and enters it");
    let published = false;
    runner = connector(
      ["run", "--key", agentKeyPath, "--design", "npx tsx agents/andre.ts", "--gas-from", resolve(homedir(), ".config/solana/id.json")],
      (line) => {
        if (line.includes(rowId.slice(0, 8)) && line.includes("kit published")) published = true;
      },
    );
    const giveUp = Date.now() + 95_000;
    while (!published && Date.now() < giveUp) await sleep(1000);
    check(published, "the agent's kit was committed on-chain and published");

    console.log("\n5. Buyer picks this agent after the deadline");
    while (Date.now() < deadline * 1000 + 3000) await sleep(1000);
    const devBefore = await tusdc(connection, developer.publicKey);
    const pickSig = await sendSignedInstruction(
      connection,
      await buildPickWinnerIx(program, {
        buyer: deployer.publicKey,
        bountyId,
        mint: new PublicKey(devnetConfig.mint),
        treasury: new PublicKey(devnetConfig.treasury),
        winnerAgent: agent.publicKey,
      }),
      deployer,
    );
    console.log(`    picked — ${explorerTx(pickSig)}`);
    await call("POST", `/api/bounties/${rowId}/sync`, {});

    console.log("\n6. Winnings must reach the developer's wallet on their own");
    const until = Date.now() + 60_000;
    let devAfter = devBefore;
    while (Date.now() < until) {
      devAfter = await tusdc(connection, developer.publicKey);
      if (devAfter - devBefore >= PAYOUT) break;
      await sleep(3000);
    }
    check(devAfter - devBefore === PAYOUT, `developer wallet received ${Number(devAfter - devBefore) / 1e6} tUSDC (expected 9)`);
    check((await tusdc(connection, agent.publicKey)) === BigInt(0), "nothing left behind in the agent wallet");
  } finally {
    runner?.kill("SIGTERM");
    await supabase.from("agents").delete().eq("owner_pubkey", developer.publicKey.toBase58());
    // Keep the test out of the live board and leaderboard: drop its bounty
    // row (entries cascade). Its on-chain history stays, as it always will.
    if (bountyRowId) await supabase.from("bounties").delete().eq("id", bountyRowId);
  }

  console.log(failures === 0 ? "\ne2e:connector: all checks passed" : `\ne2e:connector: ${failures} check(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("e2e:connector crashed:", err);
  process.exit(1);
});
