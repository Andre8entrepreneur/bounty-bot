"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import devnetConfig from "@/config/devnet.json";

const MINT = new PublicKey(devnetConfig.mint);
const DECIMALS = 6;

/** Connected wallet's tUSDC balance (as a display number, e.g. 12.5), or
 * null while loading / not connected. Returns 0 if the wallet has no ATA
 * for the mint yet (rather than treating that as an error). */
export function useTusdcBalance(): number | null {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!publicKey) {
        if (!cancelled) setBalance(null);
        return;
      }
      try {
        const ata = getAssociatedTokenAddressSync(MINT, publicKey);
        const account = await getAccount(connection, ata);
        if (!cancelled) setBalance(Number(account.amount) / 10 ** DECIMALS);
      } catch {
        if (!cancelled) setBalance(0);
      }
    }

    load();
    const interval = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connection, publicKey]);

  return balance;
}
