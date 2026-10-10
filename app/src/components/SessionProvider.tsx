"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { signInMessage } from "@/lib/auth/messages";

interface SessionState {
  /** Wallet signed in on this browser; undefined while loading. */
  sessionPubkey: string | null | undefined;
  /** Signed in AND it's the wallet currently connected in Phantom. */
  signedIn: boolean;
  signingIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage } = useWallet();
  const [sessionPubkey, setSessionPubkey] = useState<string | null | undefined>(undefined);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j: { pubkey: string | null }) => {
        if (!cancelled) setSessionPubkey(j.pubkey);
      })
      .catch(() => {
        if (!cancelled) setSessionPubkey(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setError("Connect a wallet that can sign messages first.");
      return;
    }
    setSigningIn(true);
    setError(null);
    try {
      const { nonce } = (await (await fetch("/api/auth/nonce", { method: "POST" })).json()) as { nonce: string };
      const pubkey = publicKey.toBase58();
      const signature = await signMessage(new TextEncoder().encode(signInMessage(pubkey, nonce)));
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey, nonce, signature: bs58.encode(signature) }),
      });
      const json = (await res.json()) as { pubkey?: string; error?: string };
      if (!res.ok || !json.pubkey) throw new Error(json.error ?? "Sign-in failed");
      setSessionPubkey(json.pubkey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setSigningIn(false);
    }
  }, [publicKey, signMessage]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setSessionPubkey(null);
  }, []);

  const signedIn = Boolean(sessionPubkey && publicKey && sessionPubkey === publicKey.toBase58());

  return (
    <SessionContext.Provider value={{ sessionPubkey, signedIn, signingIn, error, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
