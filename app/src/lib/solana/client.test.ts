import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  PROGRAM_ID,
  findBountyPda,
  findConfigPda,
  findEntryPda,
  findVaultPda,
} from "./client";

function u64Le(value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

test("findConfigPda is deterministic and matches the Rust seed", () => {
  const [a, bumpA] = findConfigPda();
  const [b, bumpB] = findConfigPda();
  assert.equal(a.toBase58(), b.toBase58());
  assert.equal(bumpA, bumpB);

  const [expected] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  assert.equal(a.toBase58(), expected.toBase58());
});

test("findBountyPda depends on buyer and bounty_id", () => {
  const buyer = Keypair.generate().publicKey;
  const otherBuyer = Keypair.generate().publicKey;

  const [a] = findBountyPda(buyer, 1);
  const [b] = findBountyPda(buyer, 2);
  const [c] = findBountyPda(otherBuyer, 1);

  assert.notEqual(a.toBase58(), b.toBase58(), "different bounty_id must change the PDA");
  assert.notEqual(a.toBase58(), c.toBase58(), "different buyer must change the PDA");

  const [expected] = PublicKey.findProgramAddressSync(
    [Buffer.from("bounty"), buyer.toBuffer(), u64Le(1)],
    PROGRAM_ID,
  );
  assert.equal(a.toBase58(), expected.toBase58());
});

test("findVaultPda is derived from the bounty address", () => {
  const buyer = Keypair.generate().publicKey;
  const [bountyPda] = findBountyPda(buyer, 42);
  const [vaultA] = findVaultPda(bountyPda);
  const [vaultB] = findVaultPda(bountyPda);
  assert.equal(vaultA.toBase58(), vaultB.toBase58());

  const [otherBountyPda] = findBountyPda(buyer, 43);
  const [vaultC] = findVaultPda(otherBountyPda);
  assert.notEqual(vaultA.toBase58(), vaultC.toBase58());

  const [expected] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), bountyPda.toBuffer()],
    PROGRAM_ID,
  );
  assert.equal(vaultA.toBase58(), expected.toBase58());
});

test("findEntryPda is unique per bounty + agent", () => {
  const buyer = Keypair.generate().publicKey;
  const agentA = Keypair.generate().publicKey;
  const agentB = Keypair.generate().publicKey;
  const [bountyPda] = findBountyPda(buyer, 7);

  const [entryA] = findEntryPda(bountyPda, agentA);
  const [entryB] = findEntryPda(bountyPda, agentB);
  assert.notEqual(entryA.toBase58(), entryB.toBase58(), "different agent must change the PDA");

  const [expected] = PublicKey.findProgramAddressSync(
    [Buffer.from("entry"), bountyPda.toBuffer(), agentA.toBuffer()],
    PROGRAM_ID,
  );
  assert.equal(entryA.toBase58(), expected.toBase58());
});

test("all PDAs are off-curve (valid PDAs, not on-curve keys)", () => {
  const buyer = Keypair.generate().publicKey;
  const [bountyPda] = findBountyPda(buyer, 1);
  const [vaultPda] = findVaultPda(bountyPda);
  const [configPda] = findConfigPda();
  const [entryPda] = findEntryPda(bountyPda, buyer);

  for (const pda of [bountyPda, vaultPda, configPda, entryPda]) {
    assert.equal(PublicKey.isOnCurve(pda.toBytes()), false);
  }
});
