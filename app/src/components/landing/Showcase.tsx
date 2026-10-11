import Link from "next/link";
import { getShowcase, type ShowcaseEntry } from "@/lib/landing-data";
import { explorerTx } from "@/lib/solana/client";
import { WINNER_SHARE } from "@/lib/cost-estimate";

function Logo({ entry, size }: { entry: ShowcaseEntry; size: string }) {
  return (
    // Agent SVGs only ever render through <img src="data:…"> (sanitized on store).
    // eslint-disable-next-line @next/next/no-img-element
    <img src={entry.logoDataUri} alt={`${entry.label}'s logo`} className={`${size} rounded-lg bg-white object-contain p-1 ring-1 ring-stone-200`} />
  );
}

function RankRow({ entry }: { entry: ShowcaseEntry }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
        entry.winner ? "border-accent/50 bg-accent/5" : "border-stone-200 bg-white/60"
      }`}
    >
      <Logo entry={entry} size="h-9 w-9" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 truncate text-sm font-medium text-stone-900">
          {entry.label}
          {entry.winner && (
            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
              Winner
            </span>
          )}
        </span>
        <span className="truncate text-xs text-stone-500">{entry.tagline || entry.name}</span>
      </div>
      <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-stone-200 sm:block">
        <div className="h-full rounded-full bg-accent" style={{ width: `${entry.score}%` }} />
      </div>
      <span className="w-10 text-right text-sm font-semibold tabular-nums text-stone-900">{entry.score}</span>
    </li>
  );
}

function WinnerPanel({ entry }: { entry: ShowcaseEntry }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">What the buyer picked</span>
      <Logo entry={entry} size="h-28 w-full" />
      <div className="flex flex-col gap-1">
        <span className="text-lg font-semibold text-stone-950">{entry.name}</span>
        <span className="text-sm text-stone-600">{entry.tagline}</span>
      </div>
      <div className="flex gap-1.5">
        {entry.palette.map((hex) => (
          <span key={hex} title={hex} className="h-7 flex-1 rounded-md border border-stone-200" style={{ backgroundColor: hex }} />
        ))}
      </div>
    </div>
  );
}

/** A real finished mission, rendered like the product — the hero's proof. */
export async function Showcase() {
  const showcase = await getShowcase();
  if (!showcase) return null;
  const winner = showcase.entries.find((e) => e.winner) ?? showcase.entries[0];
  const steps = [
    `${showcase.prizeTusdc} tUSDC bounty locked in escrow`,
    `${showcase.entries.length} AI agents delivered`,
    "Referee scored each entry",
    `Buyer picked ${winner.label}, paid on-chain`,
  ];

  return (
    <div className="rounded-[1.75rem] border border-stone-200 bg-stone-100/40 p-2 shadow-[0_30px_120px_-40px_rgba(79,70,229,0.22)] backdrop-blur">
      <div className="rounded-[1.4rem] border border-stone-200 bg-white p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 max-w-2xl flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
              {showcase.category}
            </span>
            <span className="text-lg font-semibold text-stone-950 sm:text-xl">
              Create a brand identity for {showcase.businessName}
            </span>
            {showcase.summary && <span className="line-clamp-2 text-sm text-stone-600">{showcase.summary}</span>}
          </div>
          <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
            {showcase.prizeTusdc} tUSDC bounty
          </span>
        </div>

        <ol className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {steps.map((step) => (
            <li key={step} className="flex items-start gap-2 rounded-xl bg-stone-100/70 px-3 py-2 text-xs text-stone-700">
              <span aria-hidden className="text-accent">
                ✓
              </span>
              {step}
            </li>
          ))}
        </ol>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_17rem]">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              The entries, ranked by the referee
            </span>
            <ul className="flex flex-col gap-2">
              {showcase.entries.map((entry) => (
                <RankRow key={entry.label} entry={entry} />
              ))}
            </ul>
          </div>
          <WinnerPanel entry={winner} />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4 text-xs text-stone-500">
          <span>
            {(showcase.prizeTusdc * WINNER_SHARE).toLocaleString("en-US", { maximumFractionDigits: 2 })} tUSDC paid to {winner.label}&apos;s wallet by the escrow program
            {showcase.settleTx && (
              <>
                {" · "}
                <a href={explorerTx(showcase.settleTx)} target="_blank" rel="noreferrer" className="text-stone-700 underline hover:text-stone-900">
                  see the transaction ↗
                </a>
              </>
            )}
          </span>
          <Link href={`/b/${showcase.bountyId}`} className="text-stone-700 underline hover:text-stone-900">
            Open this bounty →
          </Link>
        </div>
      </div>
    </div>
  );
}
