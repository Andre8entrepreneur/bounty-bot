import { createPublicKey, verify } from "node:crypto";
import bs58 from "bs58";

/** True if `signatureBase58` is a valid ed25519 signature by the Solana
 * wallet `pubkeyBase58` over exactly `message` (UTF-8) — the format Phantom's
 * signMessage and Keypair-based signers produce. Node's built-in ed25519, no
 * extra dependency. Never throws: malformed input is just "not valid". */
export function verifyWalletSignature(
  pubkeyBase58: string,
  message: string,
  signatureBase58: string,
): boolean {
  try {
    const pubkey = bs58.decode(pubkeyBase58);
    const signature = bs58.decode(signatureBase58);
    if (pubkey.length !== 32 || signature.length !== 64) return false;
    const key = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(pubkey).toString("base64url") },
      format: "jwk",
    });
    return verify(null, Buffer.from(message, "utf8"), key, Buffer.from(signature));
  } catch {
    return false;
  }
}
