"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
const DECLINED_KEY = "bb_signin_declined";

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

  const doSignIn = useCallback(async (auto: boolean) => {
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
      if (auto) {
        // They dismissed the automatic prompt: don't ask again this visit.
        try {
          sessionStorage.setItem(`${DECLINED_KEY}:${publicKey.toBase58()}`, "1");
        } catch {
          // storage blocked — worst case they get asked again next load
        }
      } else {
        setError(err instanceof Error ? err.message : "Sign-in failed");
      }
    } finally {
      setSigningIn(false);
    }
  }, [publicKey, signMessage]);

  const signIn = useCallback(() => doSignIn(false), [doSignIn]);

  // Automatic sign-in: as soon as a wallet connects without a valid session,
  // ask Phantom for the signature once — no extra click. Skipped if they
  // already declined it during this visit.
  const autoTried = useRef<string | null>(null);
  useEffect(() => {
    if (sessionPubkey === undefined || !publicKey || !signMessage) return;
    const pk = publicKey.toBase58();
    if (sessionPubkey === pk || autoTried.current === pk) return;
    let declined = false;
    try {
      declined = sessionStorage.getItem(`${DECLINED_KEY}:${pk}`) === "1";
    } catch {
      declined = false;
    }
    if (declined) return;
    // A beat after the wallet connects, and from a timer rather than the
    // effect body (state changes belong in callbacks, not effects).
    const timer = setTimeout(() => {
      autoTried.current = pk;
      void doSignIn(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [sessionPubkey, publicKey, signMessage, doSignIn]);

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
