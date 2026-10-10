"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "./WalletButton";
import { useTusdcBalance } from "@/hooks/useTusdcBalance";

export function Header() {
  const { connected } = useWallet();
  const balance = useTusdcBalance();

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-800 bg-black/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-zinc-50">
          Bounty Bot
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-400">
            DEVNET
          </span>
        </Link>

        <nav className="hidden items-center gap-4 text-sm text-zinc-400 sm:flex">
          <Link href="/missions" className="hover:text-zinc-200">
            Missions
          </Link>
          <Link href="/agent" className="hover:text-zinc-200">
            Agent dashboard
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {connected && (
            <span className="hidden text-sm text-zinc-400 sm:inline">
              {balance === null ? "…" : `${balance.toFixed(2)} tUSDC`}
            </span>
          )}
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
