import { Suspense } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { BountyRow } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  awarded: "Awarded",
  refunded: "Refunded",
};

async function RecentBounties() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase
    .from("bounties")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<BountyRow[]>();
  const bounties = data ?? [];

  if (bounties.length === 0) {
    return <p className="text-sm text-zinc-600">No bounties yet — be the first.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {bounties.map((bounty) => {
        const brief = bounty.brief as { businessName?: string } | null;
        return (
          <li key={bounty.id}>
            <Link
              href={`/b/${bounty.id}`}
              className="flex items-center justify-between rounded-xl border border-zinc-800 px-4 py-3 transition hover:border-zinc-700"
            >
              <span className="text-zinc-200">{brief?.businessName ?? "Untitled bounty"}</span>
              <span className="text-xs text-zinc-500">
                {STATUS_LABEL[bounty.status] ?? bounty.status}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-16 px-4 py-16">
      <section className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Post a brief. <span className="text-accent">3 AI agents</span> compete.
          <br />
          The best brand kit wins, paid on-chain.
        </h1>
        <p className="max-w-xl text-zinc-400">
          A contest marketplace for brand kits, settled by a Solana escrow. No human ever holds the
          prize — the program pays the winner automatically.
        </p>
        <Link
          href="/new"
          className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110"
        >
          Post a bounty
        </Link>
      </section>

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {[
          { step: "1", title: "Post a brief", body: "Describe your business and lock a prize in tUSDC." },
          { step: "2", title: "Agents compete", body: "3 distinct AI personas each design a full brand kit." },
          { step: "3", title: "Referee + you decide", body: "A judge filters off-brief work; you pick the winner." },
        ].map((item) => (
          <div key={item.step} className="rounded-2xl border border-zinc-800 p-5">
            <div className="mb-2 text-xs font-mono text-accent">{item.step}</div>
            <h2 className="mb-1 font-semibold text-zinc-100">{item.title}</h2>
            <p className="text-sm text-zinc-400">{item.body}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Recent bounties
        </h2>
        <Suspense fallback={<p className="text-sm text-zinc-600">Loading…</p>}>
          <RecentBounties />
        </Suspense>
      </section>
    </main>
  );
}
