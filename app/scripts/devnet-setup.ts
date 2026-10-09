// Idempotent devnet bootstrap: tUSDC mint, program Config, treasury ATA,
// initial tUSDC balances, SOL top-ups for agent/platform wallets. Refuses to
// run against anything but devnet. Safe to re-run — only touches what's
// actually missing, and prints "already set up" when nothing changed.
import { config } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { getPublicEnv, getServerEnv } from "../src/lib/env";
import {
  buildInitializeConfigIx,
  fetchConfig,
  findConfigPda,
  getConnection,
  getProgram,
  sendSignedInstruction,
} from "../src/lib/solana/client";
import { getAgentKeypair, getPlatformKeypair, type AgentKey } from "../src/lib/solana/keys";

config({ path: resolve(process.cwd(), ".env.local"), override: true });

const TUSDC_DECIMALS = 6;
const SEED_TUSDC_AMOUNT = 1_000 * 10 ** TUSDC_DECIMALS;
const MIN_SOL_LAMPORTS = 0.1 * LAMPORTS_PER_SOL;
const FEE_BPS = 1000;
const DEVNET_CONFIG_PATH = resolve(process.cwd(), "src/config/devnet.json");

interface DevnetConfig {
  programId: string;
  mint: string | null;
  treasury: string | null;
  config: string | null;
}

function loadDeployerKeypair(): Keypair {
  const path = resolve(homedir(), ".config/solana/id.json");
  const raw = readFileSync(path, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
}

function readDevnetConfig(): DevnetConfig {
  if (!existsSync(DEVNET_CONFIG_PATH)) {
    throw new Error(`${DEVNET_CONFIG_PATH} not found — run task 1.4 (deploy) first.`);
  }
  return JSON.parse(readFileSync(DEVNET_CONFIG_PATH, "utf-8")) as DevnetConfig;
}

function writeDevnetConfig(cfg: DevnetConfig): void {
  writeFileSync(DEVNET_CONFIG_PATH, `${JSON.stringify(cfg, null, 2)}\n`);
}

async function transferSol(
  connection: ReturnType<typeof getConnection>,
  from: Keypair,
  to: PublicKey,
  lamports: number,
): Promise<string> {
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports }),
  );
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = from.publicKey;
  tx.sign(from);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

async function main(): Promise<void> {
  const publicEnv = getPublicEnv();
  if (publicEnv.NEXT_PUBLIC_CLUSTER !== "devnet") {
    console.error(`devnet:setup refuses to run: NEXT_PUBLIC_CLUSTER is "${publicEnv.NEXT_PUBLIC_CLUSTER}", not "devnet".`);
    process.exit(1);
  }

  const serverEnv = getServerEnv();
  const connection = getConnection(serverEnv.SOLANA_RPC_URL);
  const deployer = loadDeployerKeypair();
  const platform = getPlatformKeypair();
  const devnetConfig = readDevnetConfig();

  let changed = false;

  // 1. tUSDC mint (deployer = mint authority)
  let mintPubkey: PublicKey;
  if (devnetConfig.mint) {
    mintPubkey = new PublicKey(devnetConfig.mint);
    console.log(`mint: already set (${mintPubkey.toBase58()})`);
  } else {
    mintPubkey = await createMint(connection, deployer, deployer.publicKey, null, TUSDC_DECIMALS);
    devnetConfig.mint = mintPubkey.toBase58();
    changed = true;
    console.log(`mint: created ${mintPubkey.toBase58()}`);
  }

  // 2. initialize_config (admin = treasury = platform pubkey)
  const program = getProgram(connection, deployer);
  const [configPda] = findConfigPda(program.programId);
  const existingConfig = await fetchConfig(program);
  if (existingConfig) {
    console.log(`config: already initialized (${configPda.toBase58()})`);
  } else {
    const ix = await buildInitializeConfigIx(program, {
      deployer: deployer.publicKey,
      admin: platform.publicKey,
      treasury: platform.publicKey,
      mint: mintPubkey,
      feeBps: FEE_BPS,
    });
    const sig = await sendSignedInstruction(connection, ix, deployer);
    changed = true;
    console.log(`config: initialized, tx ${sig}`);
  }
  devnetConfig.config = configPda.toBase58();
  devnetConfig.treasury = platform.publicKey.toBase58();

  // 3. Treasury ATA (idempotent by construction)
  const treasuryAta = await getOrCreateAssociatedTokenAccount(
    connection,
    deployer,
    mintPubkey,
    platform.publicKey,
  );
  console.log(`treasury ATA: ${treasuryAta.address.toBase58()}`);

  // 4. Seed tUSDC balances
  const buyerPubkey = new PublicKey(serverEnv.DEMO_BUYER_ADDRESS);
  const buyerAta = await getOrCreateAssociatedTokenAccount(connection, deployer, mintPubkey, buyerPubkey);
  if (buyerAta.amount === BigInt(0)) {
    await mintTo(connection, deployer, mintPubkey, buyerAta.address, deployer, SEED_TUSDC_AMOUNT);
    changed = true;
    console.log(`minted 1000 tUSDC to buyer (${buyerPubkey.toBase58()})`);
  } else {
    console.log(`buyer already has tUSDC (${buyerAta.amount.toString()} base units)`);
  }

  const deployerAta = await getOrCreateAssociatedTokenAccount(
    connection,
    deployer,
    mintPubkey,
    deployer.publicKey,
  );
  if (deployerAta.amount === BigInt(0)) {
    await mintTo(connection, deployer, mintPubkey, deployerAta.address, deployer, SEED_TUSDC_AMOUNT);
    changed = true;
    console.log("minted 1000 tUSDC to deployer");
  } else {
    console.log(`deployer already has tUSDC (${deployerAta.amount.toString()} base units)`);
  }

  // 5. Top up platform + 3 agents to >= 0.1 SOL from the deployer
  const topUpTargets: Array<{ name: string; pubkey: PublicKey }> = [
    { name: "platform", pubkey: platform.publicKey },
    ...(["minimal", "bold", "luxe"] as AgentKey[]).map((agent) => ({
      name: `agent-${agent}`,
      pubkey: getAgentKeypair(agent).publicKey,
    })),
  ];

  for (const target of topUpTargets) {
    const balance = await connection.getBalance(target.pubkey);
    if (balance < MIN_SOL_LAMPORTS) {
      const lamportsNeeded = MIN_SOL_LAMPORTS - balance;
      const sig = await transferSol(connection, deployer, target.pubkey, lamportsNeeded);
      changed = true;
      console.log(`topped up ${target.name} to 0.1 SOL, tx ${sig}`);
    } else {
      console.log(`${target.name} already has >= 0.1 SOL (${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL)`);
    }
  }

  writeDevnetConfig(devnetConfig);

  console.log(changed ? "devnet:setup: done" : "devnet:setup: already set up");
}

main().catch((err) => {
  console.error("devnet:setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
