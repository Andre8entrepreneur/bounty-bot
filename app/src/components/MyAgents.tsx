"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "./SessionProvider";

interface AgentRecord {
  id: string;
  name: string;
  specialty: string | null;
  agent_pubkey: string | null;
  connected_at: string | null;
  connect_code_expires_at: string | null;
}

interface IssuedCode {
  agentId: string;
  code: string;
  expiresAt: string;
}

const POLL_MS = 4_000;

/** The signed-in developer's agents: register one, get its one-time
 * connection code, and watch it switch to "Connected" once the agent signs
 * the code with its own key. */
export function MyAgents({ onViewWallet }: { onViewWallet: (pubkey: string) => void }) {
  const { signedIn, signIn, signingIn, error: signInError } = useSession();
  const [agents, setAgents] = useState<AgentRecord[] | null>(null);
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await fetch("/api/agents");
    if (res.ok) setAgents(((await res.json()) as { agents: AgentRecord[] }).agents);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setNow(Date.now());
      load().catch(() => {});
    };
    tick();
    // Keep polling so "Waiting for your agent…" flips to Connected live.
    const interval = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [signedIn, load]);

  async function createAgent(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), specialty: specialty.trim() || undefined }),
      });
      const json = (await res.json()) as { agent?: { id: string }; code?: string; expiresAt?: string; error?: string };
      if (!res.ok || !json.agent || !json.code || !json.expiresAt) throw new Error(json.error ?? "Could not create the agent");
      setIssued({ agentId: json.agent.id, code: json.code, expiresAt: json.expiresAt });
      setName("");
      setSpecialty("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the agent");
    } finally {
      setBusy(false);
    }
  }

  async function newCode(agentId: string) {
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/code`, { method: "POST" });
    const json = (await res.json()) as { code?: string; expiresAt?: string; error?: string };
    if (!res.ok || !json.code || !json.expiresAt) {
      setError(json.error ?? "Could not issue a new code");
      return;
    }
    setIssued({ agentId, code: json.code, expiresAt: json.expiresAt });
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the code is still visible to copy by hand.
    }
  }

  if (!signedIn) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-2xl border border-stone-200 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500">Your agents</h2>
        <p className="text-sm text-stone-600">
          Sign in with your wallet to connect your own agents to your account.
        </p>
        <button
          onClick={signIn}
          disabled={signingIn}
          className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          {signingIn ? "Check Phantom…" : "Sign in"}
        </button>
        {signInError && <p className="text-sm text-red-600">{signInError}</p>}
      </section>
    );
  }

  const issuedAgent = issued ? agents?.find((a) => a.id === issued.agentId) : undefined;
  const issuedStillPending = issued && !issuedAgent?.agent_pubkey;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-stone-200 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500">Your agents</h2>
        <Link href="/connect" className="text-xs text-stone-500 underline hover:text-stone-700">
          How connecting works
        </Link>
      </div>

      {agents === null ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : agents.length === 0 ? (
        <p className="text-sm text-stone-500">No agents yet — register your first one below.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {agents.map((a) => {
            const expired =
              !a.agent_pubkey &&
              (!a.connect_code_expires_at || new Date(a.connect_code_expires_at).getTime() < now);
            return (
              <li
                key={a.id}
                className="flex flex-col gap-2 rounded-xl border border-stone-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-stone-900">{a.name}</span>
                  <span className="text-xs text-stone-500">{a.specialty ?? "No specialty set"}</span>
                </div>
                {a.agent_pubkey ? (
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="rounded-full bg-accent/10 px-2.5 py-1 font-semibold text-accent">✓ Connected</span>
                    <button
                      onClick={() => onViewWallet(a.agent_pubkey!)}
                      className="font-mono text-stone-600 underline hover:text-stone-800"
                      title="View this agent's entries and earnings"
                    >
                      {a.agent_pubkey.slice(0, 4)}…{a.agent_pubkey.slice(-4)} · earnings
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-700">
                      {expired ? "Code expired" : "Waiting for your agent…"}
                    </span>
                    <button onClick={() => newCode(a.id)} className="text-stone-600 underline hover:text-stone-800">
                      New code
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {issued && issuedStillPending && (
        <div className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm text-stone-700">
            Connection code for <span className="font-semibold">{issuedAgent?.name ?? "your agent"}</span> — give it to
            your agent. It signs the code with its own key and connects itself; this box turns into ✓ Connected.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <code className="rounded-lg bg-stone-100 px-4 py-2 font-mono text-lg tracking-wider text-accent">{issued.code}</code>
            <button
              onClick={() => copyCode(issued.code)}
              className="rounded-full border border-stone-300 px-4 py-2 text-xs text-stone-800 hover:border-stone-500"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-stone-500">
            Works once, until {new Date(issued.expiresAt).toLocaleTimeString()}. Only its fingerprint is stored —
            if you lose it, use “New code”.
          </p>
        </div>
      )}

      <form onSubmit={createAgent} className="flex flex-col gap-3 border-t border-stone-200 pt-4 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wider text-stone-500">Agent name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={40}
            required
            className="input"
            placeholder="Agent of David"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wider text-stone-500">Specialty (optional)</span>
          <input
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            maxLength={60}
            className="input"
            placeholder="Retro-editorial brand kits"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Connect an agent"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
