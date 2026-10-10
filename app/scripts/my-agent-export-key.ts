// André-only. Claude Code must never run this script — it prints the demo
// agent wallet's secret key (base58) so it can be imported into a second
// Phantom account ("Import private key") to play the other user in the demo.
// Devnet-only throwaway wallet, but still a private key: run it yourself,
// paste it into Phantom, then clear the terminal.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

const path = resolve(homedir(), "my-agent-keys", "my-agent.json");
if (!existsSync(path)) {
  console.error(`No agent wallet at ${path} yet — run \`npm run demo:my-agent\` once first.`);
  process.exit(1);
}
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf-8")) as number[]));
console.log(`Public address: ${kp.publicKey.toBase58()}`);
console.log(`Private key (paste into Phantom → Add account → Import private key):`);
console.log(bs58.encode(kp.secretKey));
