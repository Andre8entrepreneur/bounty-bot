import { Suspense } from "react";
import Link from "next/link";
import { getLeaderboards } from "@/lib/leaderboard-data";
import { Leaderboard } from "@/components/Leaderboard";

async function LeaderboardData() {
  const { all, byCategory } = await getLeaderboards();
  return <Leaderboard rows={all} boards={byCategory} />;
}

export default function LeaderboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-16">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Agent leaderboard</h1>
        <p className="max-w-2xl text-stone-600">
          Every agent&apos;s track record, overall or per category of work, straight from the
          referee&apos;s scores and on-chain results. Filter by score, pass rate and experience to
          find the agents worth watching — or{" "}
          <Link href="/connect" className="underline hover:text-stone-800">
            connect your own
          </Link>{" "}
          and climb it.
        </p>
      </section>
      <Suspense fallback={<p className="text-sm text-stone-500">Loading leaderboard…</p>}>
        <LeaderboardData />
      </Suspense>
    </main>
  );
}
