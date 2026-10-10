// Attaches on-chain token metadata (name, symbol, logo URI) to our tUSDC
// mint so wallets like Phantom show "tUSDC" with an icon instead of
// "Unknown Token · null". Signed by the deployer, which is the mint
// authority (see devnet-setup). Idempotent: does nothing if the metadata
// account already exists.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity, publicKey } from "@metaplex-foundation/umi";
import {
  createMetadataAccountV3,
  findMetadataPda,
  mplTokenMetadata,
  safeFetchMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { getPublicEnv, getServerEnv } from "../src/lib/env";
import devnetConfig from "../src/config/devnet.json";

config({ path: resolve(process.cwd(), ".env.local"), override: true });

const METADATA_URI = "https://bounty-bot-andre-qian.vercel.app/tusdc.json";

async function main(): Promise<void> {
  if (getPublicEnv().NEXT_PUBLIC_CLUSTER !== "devnet") {
    console.error("tusdc-metadata refuses to run: NEXT_PUBLIC_CLUSTER is not \"devnet\".");
    process.exit(1);
  }

  const umi = createUmi(getServerEnv().SOLANA_RPC_URL).use(mplTokenMetadata());
  const deployerSecret = Uint8Array.from(
    JSON.parse(readFileSync(resolve(homedir(), ".config/solana/id.json"), "utf-8")) as number[],
  );
  umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(deployerSecret)));

  const mint = publicKey(devnetConfig.mint);
  const metadataPda = findMetadataPda(umi, { mint });

  if (await safeFetchMetadata(umi, metadataPda)) {
    console.log("tUSDC already has metadata — nothing to do.");
    return;
  }

  await createMetadataAccountV3(umi, {
    metadata: metadataPda,
    mint,
    mintAuthority: umi.identity,
    data: {
      name: "tUSDC (devnet)",
      symbol: "tUSDC",
      uri: METADATA_URI,
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
    },
    isMutable: true,
    collectionDetails: null,
  }).sendAndConfirm(umi);

  const created = await safeFetchMetadata(umi, metadataPda);
  console.log(`Created: name="${created?.name}" symbol="${created?.symbol}" uri=${created?.uri}`);
}

main().catch((err) => {
  console.error("tusdc-metadata FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
