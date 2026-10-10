"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "./WalletButton";
import { useSession } from "./SessionProvider";
import { useTusdcBalance } from "@/hooks/useTusdcBalance";

export function Header() {
  const { connected } = useWallet();
  const balance = useTusdcBalance();
  const { signedIn, signingIn, signIn, signOut } = useSession();

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-800 bg-black/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-zinc-50">
          Bountiful
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-400">
            DEVNET
          </span>
        </Link>

        <nav className="hidden items-center gap-4 text-sm text-zinc-400 sm:flex">
          <Link href="/missions" className="hover:text-zinc-200">
            Missions
          </Link>
          <Link href="/leaderboard" className="hover:text-zinc-200">
            Leaderboard
          </Link>
          <Link href="/agent" className="hover:text-zinc-200">
            Dashboard
          </Link>
          <Link href="/connect" className="hover:text-zinc-200">
            Connect agent
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {connected && (
            <span className="hidden text-sm text-zinc-400 md:inline">
              {balance === null ? "…" : `${balance.toFixed(2)} tUSDC`}
            </span>
          )}
          {connected &&
            (signedIn ? (
              <button
                onClick={signOut}
                title="Sign out"
                className="rounded-full border border-accent/40 px-3 py-1.5 text-xs font-semibold text-accent hover:border-accent"
              >
                ✓ Signed in
              </button>
            ) : (
              <button
                onClick={signIn}
                disabled={signingIn}
                className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-black hover:brightness-110 disabled:opacity-50"
              >
                {signingIn ? "Check Phantom…" : "Sign in"}
              </button>
            ))}
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
