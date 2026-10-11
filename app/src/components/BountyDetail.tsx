"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { buildPickWinnerIx, explorerTx, fetchEntries, getProgram } from "@/lib/solana/client";
import { useAgentLabel } from "@/hooks/useAgentLabel";
import type { BountyRow, EntryRow } from "@/lib/types";
import { Countdown } from "@/components/Countdown";
import { RankingBoard } from "@/components/RankingBoard";
import { MissionCostTable } from "@/components/MissionCost";
import type { Calibration } from "@/lib/cost-estimate";
import type { RankRow } from "@/lib/ranking";
import { DEFAULT_MIN_SCORE, type Brief } from "@/lib/agents/schema";
import devnetConfig from "@/config/devnet.json";

interface OnchainEntrySummary {
  agentPubkey: string;
  submittedAtMs: number;
}

const AGENTS = ["minimal", "bold", "luxe"] as const;

export function BountyDetail({ id, calibration }: { id: string; calibration: Calibration }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const labelFor = useAgentLabel();

  const [bounty, setBounty] = useState<BountyRow | null>(null);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [onchainEntries, setOnchainEntries] = useState<OnchainEntrySummary[]>([]);
  const [picking, setPicking] = useState<string | null>(null);
  const [pickTxSig, setPickTxSig] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const calledReferee = useRef(false);
  const calledSettle = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Entries from a third-party agent never touch our DB (nothing inserts a
  // row for them), so Supabase Realtime can't catch them — poll the chain
  // directly to pick up any entry our own 3 agents didn't submit.
  useEffect(() => {
    const onchainAddress: string = bounty?.onchain_address ?? "";
    if (!onchainAddress) return;
    let cancelled = false;

    async function poll() {
      try {
        const program = getProgram(connection);
        const results = await fetchEntries(program, new PublicKey(onchainAddress));
        if (cancelled) return;
        setOnchainEntries(
          results.map((r) => ({
            agentPubkey: r.account.agent.toBase58(),
            submittedAtMs: Number(r.account.submittedAt) * 1000,
          })),
        );
      } catch {
        // best-effort; the DB-backed cards still work without this
      }
    }

    poll();
    const interval = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connection, bounty?.onchain_address]);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [{ data: b }, { data: e }] = await Promise.all([
      supabase.from("bounties").select("*").eq("id", id).single<BountyRow>(),
      supabase.from("entries").select("*").eq("bounty_id", id).returns<EntryRow[]>(),
    ]);
    if (b) setBounty(b);
    if (e) setEntries(e);
  }, [id]);

  useEffect(() => {
    let ignore = false;
    const supabase = getSupabaseBrowserClient();

    (async () => {
      const [{ data: b }, { data: e }] = await Promise.all([
        supabase.from("bounties").select("*").eq("id", id).single<BountyRow>(),
        supabase.from("entries").select("*").eq("bounty_id", id).returns<EntryRow[]>(),
      ]);
      if (ignore) return;
      if (b) setBounty(b);
      if (e) setEntries(e);
    })();

    const channel = supabase
      .channel(`bounty-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bounties", filter: `id=eq.${id}` },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "entries", filter: `bounty_id=eq.${id}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, [id, refresh]);

  // Fire /referee at the deadline and /settle at the pick deadline. Both
  // routes are idempotent — a stray extra call is harmless.
  useEffect(() => {
    if (!bounty || bounty.status !== "open") return;
    const deadlineMs = bounty.deadline ? new Date(bounty.deadline).getTime() : null;
    const pickDeadlineMs = bounty.pick_deadline ? new Date(bounty.pick_deadline).getTime() : null;

    const interval = setInterval(() => {
      const nowMs = Date.now();
      if (deadlineMs && nowMs >= deadlineMs && !calledReferee.current) {
        calledReferee.current = true;
        fetch(`/api/bounties/${id}/referee`, { method: "POST" })
          .then(() => refresh())
          .catch(() => {
            calledReferee.current = false;
          });
      }
      if (pickDeadlineMs && nowMs >= pickDeadlineMs && !calledSettle.current) {
        calledSettle.current = true;
        // /sync too: if the buyer picked from another tab, settle sees the
        // bounty already settled on-chain and this keeps the DB in step.
        fetch(`/api/bounties/${id}/settle`, { method: "POST" })
          .then(() => fetch(`/api/bounties/${id}/sync`, { method: "POST" }))
          .then(() => refresh())
          .catch(() => {
            calledSettle.current = false;
          });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [bounty, id, refresh]);

  async function pickWinner(winner: { id: string; agent_pubkey: string | null }) {
    if (!bounty || !publicKey || !winner.agent_pubkey) return;
    setPicking(winner.id);
    try {
      const program = getProgram(connection);
      const ix = await buildPickWinnerIx(program, {
        buyer: new PublicKey(bounty.buyer!),
        bountyId: BigInt(bounty.bounty_id!),
        mint: new PublicKey(devnetConfig.mint),
        treasury: new PublicKey(devnetConfig.treasury),
        winnerAgent: new PublicKey(winner.agent_pubkey),
      });
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash }).add(ix);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      setPickTxSig(sig);
      await fetch(`/api/bounties/${id}/sync`, { method: "POST" });
      await refresh();
    } catch (err) {
      console.error("pick_winner failed", err);
    } finally {
      setPicking(null);
    }
  }

  if (!bounty) {
    return <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 text-stone-500">Loading…</main>;
  }

  const brief = bounty.brief as Partial<Brief> | null;
  const deadlineMs = bounty.deadline ? new Date(bounty.deadline).getTime() : 0;
  const pickDeadlineMs = bounty.pick_deadline ? new Date(bounty.pick_deadline).getTime() : 0;
  const pastDeadline = now >= deadlineMs;
  const inPickWindow = bounty.status === "open" && now >= deadlineMs && now < pickDeadlineMs;
  const isBuyer = publicKey?.toBase58() === bounty.buyer;
  // Our 3 agents always get a row (even while still "working…"); any other
  // agent gets one once it has submitted on-chain. `key` is the persona key
  // for ours and the wallet pubkey for everyone else — the same value
  // settle/sync store in winner_agent, so winner detection works for both.
  const rows: RankRow[] = [
    ...AGENTS.map((agent) => ({ key: agent, entry: entries.find((e) => e.agent_key === agent) })),
    ...entries
      .filter((e) => e.agent_key === null)
      .map((e) => ({ key: e.agent_pubkey ?? e.id, entry: e })),
    ...onchainEntries
      .filter((e) => !entries.some((dbEntry) => dbEntry.agent_pubkey === e.agentPubkey))
      .map((e) => ({ key: e.agentPubkey, unpublishedAtMs: e.submittedAtMs })),
  ];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-12">
      <section className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {brief?.businessName ?? "Bounty"}
        </h1>
        <div className="flex items-center gap-2 text-sm text-stone-600">
          <span>{bounty.amount ? (bounty.amount / 1_000_000).toFixed(0) : "?"} tUSDC prize</span>
          <span>·</span>
          <span className="capitalize">{bounty.status}</span>
        </div>

        {bounty.status === "open" && (
          <Countdown
            target={new Date(pastDeadline ? pickDeadlineMs : deadlineMs)}
            label={pastDeadline ? "Pick window closes" : "Submissions close"}
          />
        )}

        {bounty.status === "awarded" && (
          <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">
            Awarded to{" "}
            <span className="font-semibold">
              {bounty.winner_agent ? labelFor(bounty.winner_agent) : bounty.winner_agent}
            </span>
            {bounty.settle_tx && (
              <>
                {" — "}
                <a href={explorerTx(bounty.settle_tx)} target="_blank" rel="noreferrer" className="underline">
                  view payout
                </a>
              </>
            )}
            {!bounty.settle_tx && pickTxSig && (
              <>
                {" — "}
                <a href={explorerTx(pickTxSig)} target="_blank" rel="noreferrer" className="underline">
                  view payout
                </a>
              </>
            )}
          </div>
        )}

        {bounty.status === "refunded" && (
          <div className="rounded-xl border border-stone-300 bg-stone-100 px-4 py-3 text-sm text-stone-600">
            {onchainEntries.length === 0
              ? "No agent entered — refunded in full to the buyer."
              : "No winner was picked in time — refunded in full to the buyer."}
          </div>
        )}

        {bounty.create_tx && (
          <a
            href={explorerTx(bounty.create_tx)}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-stone-500 underline hover:text-stone-600"
          >
            View bounty creation on Explorer
          </a>
        )}
      </section>

      <RankingBoard
        rows={rows}
        winnerKey={bounty.status === "awarded" ? bounty.winner_agent : null}
        minScore={brief?.minScore ?? DEFAULT_MIN_SCORE}
        canPick={inPickWindow && isBuyer}
        picking={picking}
        onPick={pickWinner}
      />

      <details className="group rounded-2xl border border-stone-200 p-5" open={bounty.status === "open" && !pastDeadline}>
        <summary className="cursor-pointer list-none text-sm font-semibold text-stone-800">
          <span className="mr-2 inline-block text-stone-500 transition group-open:rotate-90">›</span>
          Is this bounty worth it for an agent?
        </summary>
        <div className="pt-4">
          <MissionCostTable
            brief={bounty.brief}
            prizeTusdc={bounty.amount !== null ? bounty.amount / 1_000_000 : null}
            calibration={calibration}
          />
        </div>
      </details>
    </main>
  );
}
