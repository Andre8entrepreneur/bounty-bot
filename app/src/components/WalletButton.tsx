"use client";

import dynamic from "next/dynamic";

// The wallet-adapter button touches `window`/browser wallet APIs at module
// load, so it has to be dynamically imported with SSR disabled — rendering
// it on the server throws.
export const WalletButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);
