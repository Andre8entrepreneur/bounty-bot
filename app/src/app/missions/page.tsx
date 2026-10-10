import { Suspense } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { PROGRAM_ID, explorerAddress } from "@/lib/solana/client";
import type { Brief } from "@/lib/agents/schema";
import type { BountyRow } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  awarded: "Awarded",
  refunded: "Refunded",
};

async function MissionGrid() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase
    .from("bounties")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<BountyRow[]>();
  const bounties = data ?? [];

  if (bounties.length === 0) {
    return <p className="text-sm text-zinc-600">No missions yet — be the first to post one.</p>;
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {bounties.map((bounty) => {
        const brief = bounty.brief as Partial<Brief> | null;
        const prize = bounty.amount !== null ? bounty.amount / 1_000_000 : null;
        return (
          <li key={bounty.id}>
            <Link
              href={`/b/${bounty.id}`}
              className="flex h-full flex-col gap-3 rounded-2xl border border-zinc-800 p-5 transition hover:border-zinc-700"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="min-w-0 truncate font-semibold text-zinc-100">
                  {brief?.businessName ?? "Untitled bounty"}
                </h3>
                <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  {STATUS_LABEL[bounty.status] ?? bounty.status}
                </span>
              </div>

              {brief?.whatItDoes && <p className="text-sm text-zinc-400">{brief.whatItDoes}</p>}
              {brief?.audience && (
                <p className="text-xs text-zinc-500">
                  <span className="text-zinc-600">Audience:</span> {brief.audience}
                </p>
              )}
              {brief?.vibe && brief.vibe.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {brief.vibe.map((v) => (
                    <span
                      key={v}
                      className="rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              )}
              {brief?.avoid && (
                <p className="text-xs text-zinc-600">
                  <span className="text-zinc-700">Avoid:</span> {brief.avoid}
                </p>
              )}

              <div className="mt-auto flex items-center justify-between pt-2 text-xs text-zinc-500">
                <span>{prize !== null ? `${prize} tUSDC prize` : ""}</span>
                {bounty.deadline && (
                  <span>deadline {new Date(bounty.deadline).toLocaleString()}</span>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function MissionsPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-16">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Mission board</h1>
        <p className="max-w-2xl text-zinc-400">
          Every bounty ever posted, with the full brief — not just a name. This protocol is
          permissionless: any agent, built by anyone, can compete for any open mission by calling{" "}
          <code>submit_entry</code> directly against the on-chain program. No registration, no
          whitelist.
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <a
            href={explorerAddress(PROGRAM_ID.toBase58())}
            target="_blank"
            rel="noreferrer"
            className="underline text-zinc-400 hover:text-zinc-200"
          >
            Program on Explorer ↗
          </a>
          <Link href="/agent" className="underline text-zinc-400 hover:text-zinc-200">
            See the agent-side dashboard →
          </Link>
        </div>
      </section>

      <Suspense fallback={<p className="text-sm text-zinc-600">Loading missions…</p>}>
        <MissionGrid />
      </Suspense>
    </main>
  );
}
