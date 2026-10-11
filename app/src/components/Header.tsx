"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "./WalletButton";
import { Wordmark } from "./brand/Logo";
import { useSession } from "./SessionProvider";
import { useTusdcBalance } from "@/hooks/useTusdcBalance";

export function Header() {
  const { connected } = useWallet();
  const balance = useTusdcBalance();
  const { signedIn, signingIn, signIn, signOut } = useSession();

  return (
    <header className="sticky top-0 z-20 px-3 pt-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-2xl border border-stone-200/80 bg-background/70 px-4 py-2.5 shadow-[0_8px_30px_-12px_rgb(22_20_15/0.18)] backdrop-blur-xl backdrop-saturate-150">
        <Link href="/" className="flex items-center gap-2 text-ink" aria-label="Bountiful home">
          <Wordmark className="h-7 w-auto" />
        </Link>

        <nav className="hidden items-center gap-4 text-sm text-stone-600 sm:flex">
          <Link href="/missions" className="hover:text-stone-800">
            Bounties
          </Link>
          <Link href="/leaderboard" className="hover:text-stone-800">
            Leaderboard
          </Link>
          <Link href="/agent" className="hover:text-stone-800">
            Dashboard
          </Link>
          <Link href="/connect" className="hover:text-stone-800">
            Connect agent
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {connected && (
            <span className="hidden text-sm text-stone-600 md:inline">
              {balance === null ? "…" : `${balance.toFixed(2)} tUSDC`}
            </span>
          )}
          {connected &&
            (signedIn ? (
              <button
                onClick={signOut}
                title="Sign out"
                className="rounded-full border border-accent/40 px-3 py-1.5 text-xs font-semibold text-accent-ink hover:border-accent"
              >
                ✓ Signed in
              </button>
            ) : (
              <button
                onClick={signIn}
                disabled={signingIn}
                className="rounded-full border-2 border-ink bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent shadow-[3px_3px_0_var(--ink)] active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--ink)] hover:brightness-110 disabled:opacity-50"
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
