import {
  AnchorProvider,
  BN,
  Program,
  type IdlAccounts,
  type IdlTypes,
} from "@anchor-lang/core";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import idlJson from "./idl/escrow.json";
import type { Escrow } from "./idl/escrow";
import { Wallet as AnchorWallet } from "@anchor-lang/core";

const idl = idlJson as Escrow;

export const PROGRAM_ID = new PublicKey(idl.address);

export type ConfigAccount = IdlAccounts<Escrow>["config"];
export type BountyAccount = IdlAccounts<Escrow>["bounty"];
export type EntryAccount = IdlAccounts<Escrow>["entry"];
export type BountyStatus = IdlTypes<Escrow>["bountyStatus"];

// ---------- Program / provider ----------

/** Builds a Program client. Pass a payer Keypair for scripts/route handlers
 * that need to send transactions; omit it for read-only fetches. */
export function getProgram(connection: Connection, payer?: Keypair): Program<Escrow> {
  const wallet = payer ? new AnchorWallet(payer) : new AnchorWallet(Keypair.generate());
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return new Program<Escrow>(idl, provider);
}

// ---------- PDA helpers ----------

function u64LeBytes(value: bigint | number): Buffer {
  return new BN(value.toString()).toArrayLike(Buffer, "le", 8);
}

export function findConfigPda(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
}

export function findBountyPda(
  buyer: PublicKey,
  bountyId: bigint | number,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bounty"), buyer.toBuffer(), u64LeBytes(bountyId)],
    programId,
  );
}

export function findVaultPda(
  bounty: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), bounty.toBuffer()], programId);
}

export function findEntryPda(
  bounty: PublicKey,
  agent: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("entry"), bounty.toBuffer(), agent.toBuffer()],
    programId,
  );
}

// ---------- Typed fetchers ----------

export async function fetchConfig(program: Program<Escrow>): Promise<ConfigAccount | null> {
  const [configPda] = findConfigPda(program.programId);
  try {
    return await program.account.config.fetch(configPda);
  } catch {
    return null;
  }
}

export async function fetchBounty(
  program: Program<Escrow>,
  buyer: PublicKey,
  bountyId: bigint | number,
): Promise<BountyAccount | null> {
  const [bountyPda] = findBountyPda(buyer, bountyId, program.programId);
  try {
    return await program.account.bounty.fetch(bountyPda);
  } catch {
    return null;
  }
}

export async function fetchEntries(
  program: Program<Escrow>,
  bounty: PublicKey,
): Promise<Array<{ publicKey: PublicKey; account: EntryAccount }>> {
  return program.account.entry.all([
    { memcmp: { offset: 8, bytes: bounty.toBase58() } },
  ]);
}

// ---------- Instruction builders ----------
// Each builder computes every PDA/ATA itself and returns a plain, unsigned
// TransactionInstruction — callers compose/sign/send.

export async function buildInitializeConfigIx(
  program: Program<Escrow>,
  params: { deployer: PublicKey; admin: PublicKey; treasury: PublicKey; mint: PublicKey; feeBps: number },
): Promise<TransactionInstruction> {
  const [configPda] = findConfigPda(program.programId);
  return program.methods
    .initializeConfig(params.feeBps)
    .accountsStrict({
      deployer: params.deployer,
      config: configPda,
      admin: params.admin,
      treasury: params.treasury,
      mint: params.mint,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export async function buildCreateBountyIx(
  program: Program<Escrow>,
  params: {
    buyer: PublicKey;
    mint: PublicKey;
    bountyId: bigint | number;
    amount: bigint | number;
    deadline: bigint | number;
    pickWindowSecs: bigint | number;
    briefHash: Uint8Array;
  },
): Promise<TransactionInstruction> {
  const [configPda] = findConfigPda(program.programId);
  const [bountyPda] = findBountyPda(params.buyer, params.bountyId, program.programId);
  const [vaultPda] = findVaultPda(bountyPda, program.programId);
  const buyerAta = getAssociatedTokenAddressSync(params.mint, params.buyer);

  return program.methods
    .createBounty(
      new BN(params.bountyId.toString()),
      new BN(params.amount.toString()),
      new BN(params.deadline.toString()),
      new BN(params.pickWindowSecs.toString()),
      Array.from(params.briefHash),
    )
    .accountsStrict({
      buyer: params.buyer,
      config: configPda,
      bounty: bountyPda,
      vault: vaultPda,
      mint: params.mint,
      buyerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
}

export async function buildSubmitEntryIx(
  program: Program<Escrow>,
  params: { agent: PublicKey; buyer: PublicKey; bountyId: bigint | number; contentHash: Uint8Array },
): Promise<TransactionInstruction> {
  const [bountyPda] = findBountyPda(params.buyer, params.bountyId, program.programId);
  const [entryPda] = findEntryPda(bountyPda, params.agent, program.programId);

  return program.methods
    .submitEntry(Array.from(params.contentHash))
    .accountsStrict({
      agent: params.agent,
      bounty: bountyPda,
      entry: entryPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

interface PayoutParams {
  buyer: PublicKey;
  bountyId: bigint | number;
  mint: PublicKey;
  treasury: PublicKey;
  winnerAgent: PublicKey;
}

function payoutAccounts(program: Program<Escrow>, params: PayoutParams) {
  const [configPda] = findConfigPda(program.programId);
  const [bountyPda] = findBountyPda(params.buyer, params.bountyId, program.programId);
  const [vaultPda] = findVaultPda(bountyPda, program.programId);
  const [entryPda] = findEntryPda(bountyPda, params.winnerAgent, program.programId);
  const winnerAta = getAssociatedTokenAddressSync(params.mint, params.winnerAgent);
  const treasuryAta = getAssociatedTokenAddressSync(params.mint, params.treasury);

  return {
    configPda,
    bountyPda,
    vaultPda,
    entryPda,
    winnerAta,
    treasuryAta,
  };
}

export async function buildPickWinnerIx(
  program: Program<Escrow>,
  params: PayoutParams,
): Promise<TransactionInstruction> {
  const a = payoutAccounts(program, params);
  return program.methods
    .pickWinner()
    .accountsStrict({
      buyer: params.buyer,
      config: a.configPda,
      bounty: a.bountyPda,
      vault: a.vaultPda,
      winnerEntry: a.entryPda,
      agent: params.winnerAgent,
      winnerAta: a.winnerAta,
      treasuryAta: a.treasuryAta,
      mint: params.mint,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export async function buildAutoAwardIx(
  program: Program<Escrow>,
  params: PayoutParams & { admin: PublicKey },
): Promise<TransactionInstruction> {
  const a = payoutAccounts(program, params);
  return program.methods
    .autoAward()
    .accountsStrict({
      admin: params.admin,
      config: a.configPda,
      bounty: a.bountyPda,
      vault: a.vaultPda,
      winnerEntry: a.entryPda,
      agent: params.winnerAgent,
      winnerAta: a.winnerAta,
      treasuryAta: a.treasuryAta,
      mint: params.mint,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export async function buildRefundIx(
  program: Program<Escrow>,
  params: { signer: PublicKey; buyer: PublicKey; bountyId: bigint | number; mint: PublicKey },
): Promise<TransactionInstruction> {
  const [configPda] = findConfigPda(program.programId);
  const [bountyPda] = findBountyPda(params.buyer, params.bountyId, program.programId);
  const [vaultPda] = findVaultPda(bountyPda, program.programId);
  const buyerAta = getAssociatedTokenAddressSync(params.mint, params.buyer);

  return program.methods
    .refund()
    .accountsStrict({
      signer: params.signer,
      config: configPda,
      bounty: bountyPda,
      vault: vaultPda,
      buyerAta,
      mint: params.mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
}

// ---------- Misc ----------

export function explorerTx(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}
