import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Brief } from "@/lib/agents/schema";
import type { BountyRow } from "@/lib/types";

export async function MissionTicker() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase
    .from("bounties")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(12)
    .returns<BountyRow[]>();
  const bounties = data ?? [];

  if (bounties.length === 0) return null;

  // Duplicated once so the -50% translateX loop is seamless.
  const track = [...bounties, ...bounties];

  return (
    <div className="w-full overflow-hidden border-y border-stone-200 bg-white/60 py-4">
      <div className="marquee-track flex w-max gap-4">
        {track.map((bounty, i) => {
          const brief = bounty.brief as Partial<Brief> | null;
          const prize = bounty.amount !== null ? bounty.amount / 1_000_000 : null;
          return (
            <Link
              key={`${bounty.id}-${i}`}
              href={`/b/${bounty.id}`}
              className="flex shrink-0 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm transition hover:border-stone-300"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span className="font-medium text-stone-800">
                {brief?.businessName ?? "Untitled bounty"}
              </span>
              {prize !== null && <span className="text-stone-500">· {prize} tUSDC</span>}
              {brief?.vibe?.[0] && <span className="text-stone-500">· {brief.vibe[0]}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
