import { test } from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, randomBytes, sign } from "node:crypto";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { verifyWalletSignature } from "./ed25519";
import { connectAgentMessage, signInMessage } from "./messages";
import {
  createConnectCode,
  createNonce,
  createSessionToken,
  hashConnectCode,
  NONCE_TTL_MS,
  readSessionToken,
  SESSION_TTL_MS,
  verifyNonce,
} from "./tokens";

const KEY = randomBytes(32);

/** Signs the way a Solana wallet does: raw ed25519 over the message bytes. */
function walletSign(kp: Keypair, message: string): string {
  const privateKey = createPrivateKey({
    key: {
      kty: "OKP",
      crv: "Ed25519",
      d: Buffer.from(kp.secretKey.slice(0, 32)).toString("base64url"),
      x: Buffer.from(kp.publicKey.toBytes()).toString("base64url"),
    },
    format: "jwk",
  });
  return bs58.encode(sign(null, Buffer.from(message, "utf8"), privateKey));
}

test("a wallet signature over the exact message verifies", () => {
  const kp = Keypair.generate();
  const msg = signInMessage(kp.publicKey.toBase58(), "n1");
  assert.equal(verifyWalletSignature(kp.publicKey.toBase58(), msg, walletSign(kp, msg)), true);
});

test("signature fails for a different message or a different wallet", () => {
  const kp = Keypair.generate();
  const other = Keypair.generate();
  const msg = connectAgentMessage("BB-AAAA-BBBB-CC", kp.publicKey.toBase58());
  const sig = walletSign(kp, msg);
  assert.equal(verifyWalletSignature(kp.publicKey.toBase58(), msg + " ", sig), false);
  assert.equal(verifyWalletSignature(other.publicKey.toBase58(), msg, sig), false);
});

test("malformed signature input is rejected, never thrown", () => {
  assert.equal(verifyWalletSignature("not-base58!!", "m", "x"), false);
  assert.equal(verifyWalletSignature(Keypair.generate().publicKey.toBase58(), "m", "abc"), false);
});

test("nonce verifies, then expires, and can't be forged", () => {
  const now = 1_000_000;
  const nonce = createNonce(KEY, now);
  assert.equal(verifyNonce(KEY, nonce, now + 1000), true);
  assert.equal(verifyNonce(KEY, nonce, now + NONCE_TTL_MS + 1), false);
  assert.equal(verifyNonce(randomBytes(32), nonce, now + 1000), false);
  const [, rand, mac] = nonce.split(".");
  assert.equal(verifyNonce(KEY, `${now + 5}.${rand}.${mac}`, now + 1000), false);
});

test("session token round-trips, expires, and rejects tampering", () => {
  const now = 2_000_000;
  const token = createSessionToken(KEY, "Wallet111", now);
  assert.equal(readSessionToken(KEY, token, now + 1000), "Wallet111");
  assert.equal(readSessionToken(KEY, token, now + SESSION_TTL_MS + 1), null);
  assert.equal(readSessionToken(randomBytes(32), token, now + 1000), null);
  const forgedBody = Buffer.from(JSON.stringify({ pk: "Attacker", exp: now + 999_999 })).toString("base64url");
  assert.equal(readSessionToken(KEY, `${forgedBody}.${token.split(".")[1]}`, now + 1000), null);
  assert.equal(readSessionToken(KEY, "garbage", now), null);
});

test("connect codes are well-formed, distinct, and hash case-insensitively", () => {
  const a = createConnectCode();
  const b = createConnectCode();
  assert.match(a, /^BB-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}$/);
  assert.notEqual(a, b);
  assert.equal(hashConnectCode(a), hashConnectCode(` ${a.toLowerCase()} `));
});
