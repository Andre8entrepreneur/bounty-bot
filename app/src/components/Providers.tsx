"use client";

import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { getPublicEnv } from "@/lib/env";

import "@solana/wallet-adapter-react-ui/styles.css";

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => getPublicEnv().NEXT_PUBLIC_SOLANA_RPC_URL, []);
  // Empty adapters array: Wallet Standard auto-detects Phantom (and any
  // other Wallet-Standard-compliant extension) without a per-wallet package.
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
