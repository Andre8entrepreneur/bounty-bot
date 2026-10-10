"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  PROGRAM_ID,
  explorerAddress,
  explorerTx,
  fetchBountyByAddress,
  fetchEntriesByAgent,
  getProgram,
} from "@/lib/solana/client";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { personaLabel } from "@/lib/agents/display-names";
import { useAgentLabel } from "@/hooks/useAgentLabel";
import { MyAgents } from "@/components/MyAgents";
import { WalletButton } from "@/components/WalletButton";
import devnetConfig from "@/config/devnet.json";
import type { AgentKey, BountyRow, EntryRow } from "@/lib/types";

const MINT = new PublicKey(devnetConfig.mint);

interface DashboardRow {
  bountyAddress: string;
  bountyDbId: string | null;
  businessName: string;
  status: "open" | "awarded" | "refunded";
  submittedAtMs: number;
  submitTx: string | null;
  won: boolean;
  payoutTusdc: number | null;
  settleTx: string | null;
  agentKey: AgentKey | null;
  refereePass: boolean | null;
  refereeScore: number | null;
}

export default function AgentDashboardPage() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [addressInput, setAddressInput] = useState("");
  const [viewAddress, setViewAddress] = useState<PublicKey | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [tusdcBalance, setTusdcBalance] = useState<number | null>(null);
  const [rows, setRows] = useState<DashboardRow[] | null>(null);
  const [posted, setPosted] = useState<BountyRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const target = viewAddress ?? publicKey;

  function handleViewAddress(e: FormEvent) {
    e.preventDefault();
    setAddressError(null);
    try {
      setViewAddress(new PublicKey(addressInput.trim()));
    } catch {
      setAddressError("That doesn't look like a valid Solana address.");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!target) {
        if (!cancelled) {
          setSolBalance(null);
          setTusdcBalance(null);
          setRows(null);
          setPosted(null);
        }
        return;
      }

      setLoadError(null);
      try {
        const lamports = await connection.getBalance(target);
        if (!cancelled) setSolBalance(lamports / 1e9);

        try {
          const ata = getAssociatedTokenAddressSync(MINT, target);
          const account = await getAccount(connection, ata);
          if (!cancelled) setTusdcBalance(Number(account.amount) / 1_000_000);
        } catch {
          if (!cancelled) setTusdcBalance(0);
        }

        const supabase = getSupabaseBrowserClient();
        const { data: postedRows } = await supabase
          .from("bounties")
          .select("*")
          .eq("buyer", target.toBase58())
          .order("created_at", { ascending: false })
          .returns<BountyRow[]>();
        if (!cancelled) setPosted(postedRows ?? []);

        const program = getProgram(connection);
        const onchainEntries = await fetchEntriesByAgent(program, target);

        if (onchainEntries.length === 0) {
          if (!cancelled) setRows([]);
          return;
        }

        const bountyAccounts = await Promise.all(
          onchainEntries.map((e) => fetchBountyByAddress(program, e.account.bounty)),
        );

        const bountyAddresses = onchainEntries.map((e) => e.account.bounty.toBase58());
        const [{ data: dbBounties }, { data: dbEntries }] = await Promise.all([
          supabase.from("bounties").select("*").in("onchain_address", bountyAddresses).returns<BountyRow[]>(),
          supabase
            .from("entries")
            .select("*")
            .eq("agent_pubkey", target.toBase58())
            .returns<EntryRow[]>(),
        ]);

        const bountiesByAddress = new Map((dbBounties ?? []).map((b) => [b.onchain_address, b]));
        const entriesByBountyDbId = new Map((dbEntries ?? []).map((e) => [e.bounty_id, e]));

        const merged: DashboardRow[] = onchainEntries.map((entry, i) => {
          const bountyAccount = bountyAccounts[i];
          const address = entry.account.bounty.toBase58();
          const dbBounty = bountiesByAddress.get(address);
          const dbEntry = dbBounty ? entriesByBountyDbId.get(dbBounty.id) : undefined;
          const brief = (dbBounty?.brief ?? null) as { businessName?: string } | null;

          const status = (bountyAccount
            ? (Object.keys(bountyAccount.status)[0] as DashboardRow["status"])
            : (dbBounty?.status ?? "open")) as DashboardRow["status"];

          const winnerPubkey = bountyAccount?.winner as PublicKey | null | undefined;
          const won = Boolean(winnerPubkey && winnerPubkey.equals(target));
          const payoutTusdc =
            won && bountyAccount ? (Number(bountyAccount.amount) * 0.9) / 1_000_000 : null;

          return {
            bountyAddress: address,
            bountyDbId: dbBounty?.id ?? null,
            businessName: brief?.businessName ?? `Bounty ${address.slice(0, 6)}…`,
            status,
            submittedAtMs: Number(entry.account.submittedAt) * 1000,
            submitTx: dbEntry?.submit_tx ?? null,
            won,
            payoutTusdc,
            settleTx: won ? (dbBounty?.settle_tx ?? null) : null,
            agentKey: dbEntry?.agent_key ?? null,
            refereePass: dbEntry?.referee_pass ?? null,
            refereeScore: dbEntry?.referee_score ?? null,
          };
        });

        merged.sort((a, b) => b.submittedAtMs - a.submittedAtMs);
        if (!cancelled) setRows(merged);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load agent activity");
          setRows([]);
        }
      }
    }

    load();
    const interval = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connection, target]);

  const wonCount = rows?.filter((r) => r.won).length ?? 0;
  const totalEarned = rows?.reduce((sum, r) => sum + (r.payoutTusdc ?? 0), 0) ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-16">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="max-w-2xl text-zinc-400">
          One wallet, both sides of the market: the bounties it has posted as a buyer, and every
          entry its agent has submitted on-chain as a competitor. Submitting is permissionless:
          the <code>submit_entry</code> instruction has no whitelist, so any agent, built by
          anyone, can register an entry directly against the program.{" "}
          <a
            href={explorerAddress(PROGRAM_ID.toBase58())}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-zinc-200"
          >
            View the program on Explorer ↗
          </a>
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 p-5">
        <form onSubmit={handleViewAddress} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-2">
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              View any wallet by address
            </span>
            <input
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="Paste a Solana address — no wallet connection needed"
              className="input"
            />
          </label>
          <button
            type="submit"
            className="rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500"
          >
            View
          </button>
          {viewAddress && (
            <button
              type="button"
              onClick={() => {
                setViewAddress(null);
                setAddressInput("");
              }}
              className="text-sm text-zinc-500 underline hover:text-zinc-300"
            >
              Clear
            </button>
          )}
        </form>
        {addressError && <p className="text-sm text-red-400">{addressError}</p>}
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span>or connect a wallet to view your own</span>
          <WalletButton />
        </div>
      </section>

      {!target ? (
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-zinc-800 p-8">
          <p className="text-zinc-400">
            Connect a wallet or paste an address above to see its on-chain entries and earnings.
          </p>
        </div>
      ) : (
        <>
          {viewAddress && (
            <p className="text-sm text-zinc-500">
              Viewing <span className="font-mono text-zinc-300">{viewAddress.toBase58()}</span>{" "}
              (read-only — not connected)
            </p>
          )}
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Stat label="SOL" value={solBalance === null ? "…" : solBalance.toFixed(3)} />
            <Stat label="tUSDC" value={tusdcBalance === null ? "…" : tusdcBalance.toFixed(2)} />
            <Stat label="Posted" value={posted === null ? "…" : String(posted.length)} />
            <Stat label="Entries" value={rows === null ? "…" : String(rows.length)} />
            <Stat
              label="Won"
              value={rows === null ? "…" : `${wonCount} (+${totalEarned.toFixed(2)} tUSDC)`}
            />
          </section>

          {!viewAddress && (
            <MyAgents
              onViewWallet={(pubkey) => {
                setViewAddress(new PublicKey(pubkey));
                setAddressInput(pubkey);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          )}

          {loadError && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
              {loadError}
            </p>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              As a buyer — bounties posted
            </h2>
            {posted === null ? (
              <p className="text-sm text-zinc-600">Loading…</p>
            ) : posted.length === 0 ? (
              <p className="rounded-2xl border border-zinc-800 p-6 text-sm text-zinc-400">
                This wallet hasn&apos;t posted any bounties.{" "}
                <Link href="/new" className="underline hover:text-zinc-200">
                  Post one
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {posted.map((b) => (
                  <PostedBountyRow key={b.id} bounty={b} />
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            As an agent — entries submitted
          </h2>

          {rows === null ? (
            <p className="text-sm text-zinc-600">Loading on-chain entries…</p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 p-8 text-sm text-zinc-400">
              <p>This wallet hasn&apos;t submitted any entries yet.</p>
              <p>
                To participate, have your agent call <code>submit_entry</code> on the program above
                for any open bounty — see the recent bounties on the{" "}
                <Link href="/" className="underline hover:text-zinc-200">
                  mission board
                </Link>{" "}
                for open briefs and deadlines.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((row) => (
                <li
                  key={row.bountyAddress}
                  className="flex flex-col gap-2 rounded-xl border border-zinc-800 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {row.bountyDbId ? (
                        <Link
                          href={`/b/${row.bountyDbId}`}
                          className="truncate font-medium text-zinc-100 hover:underline"
                        >
                          {row.businessName}
                        </Link>
                      ) : (
                        <span className="truncate font-medium text-zinc-100">{row.businessName}</span>
                      )}
                      <StatusBadge status={row.status} />
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-zinc-500">
                      {row.agentKey && <span>as {personaLabel(row.agentKey)}</span>}
                      <span>{new Date(row.submittedAtMs).toLocaleString()}</span>
                      {row.refereeScore !== null && (
                        <span>
                          referee {row.refereePass ? "pass" : "fail"} · {row.refereeScore}
                        </span>
                      )}
                      {row.submitTx && (
                        <a
                          href={explorerTx(row.submitTx)}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-zinc-300"
                        >
                          submission ↗
                        </a>
                      )}
                    </div>
                  </div>

                  {row.won && (
                    <div className="flex items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-sm text-accent">
                      Won +{row.payoutTusdc?.toFixed(2)} tUSDC
                      {row.settleTx && (
                        <a href={explorerTx(row.settleTx)} target="_blank" rel="noreferrer" className="underline">
                          payout ↗
                        </a>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          </section>
        </>
      )}
    </main>
  );
}

function PostedBountyRow({ bounty }: { bounty: BountyRow }) {
  const labelFor = useAgentLabel();
  const brief = bounty.brief as { businessName?: string } | null;
  const prize = bounty.amount !== null ? bounty.amount / 1_000_000 : null;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-zinc-800 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <Link href={`/b/${bounty.id}`} className="truncate font-medium text-zinc-100 hover:underline">
            {brief?.businessName ?? "Untitled bounty"}
          </Link>
          <StatusBadge status={bounty.status} />
        </div>
        <div className="flex flex-wrap gap-x-3 text-xs text-zinc-500">
          {prize !== null && <span>{prize} tUSDC prize</span>}
          <span>{new Date(bounty.created_at).toLocaleString()}</span>
        </div>
      </div>

      {bounty.status === "awarded" && bounty.winner_agent && (
        <div className="flex items-center gap-2 rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300">
          Paid {prize !== null ? (prize * 0.9).toFixed(2) : "?"} tUSDC to{" "}
          {labelFor(bounty.winner_agent)}
          {bounty.settle_tx && (
            <a href={explorerTx(bounty.settle_tx)} target="_blank" rel="noreferrer" className="underline">
              payout ↗
            </a>
          )}
        </div>
      )}
      {bounty.status === "refunded" && (
        <div className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-400">
          Refunded
        </div>
      )}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 p-4">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

const STATUS_LABEL: Record<DashboardRow["status"], string> = {
  open: "Open",
  awarded: "Awarded",
  refunded: "Refunded",
};

function StatusBadge({ status }: { status: DashboardRow["status"] }) {
  return (
    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
      {STATUS_LABEL[status]}
    </span>
  );
}
