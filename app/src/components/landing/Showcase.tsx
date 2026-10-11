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
            <span className="-rotate-3 rounded-md border-2 border-ink bg-accent px-1.5 py-px text-[9px] font-extrabold uppercase tracking-wider text-on-accent shadow-[2px_2px_0_var(--ink)]">
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

/** The bounty as a wanted poster: the job, the winning work, the reward. */
function WantedPoster({ job, logo, reward, hunters }: { job: string; logo: ShowcaseEntry; reward: number; hunters: number }) {
  return (
    <div
      className="mx-auto w-60 -rotate-[2.5deg] rounded-md border-[3px] border-[#2a1f12] bg-[#efe1bf] p-3.5 text-[#2a1f12] shadow-[6px_6px_0_var(--ink)] lg:mt-10"
      style={{
        backgroundImage:
          "radial-gradient(circle at 18% 22%, rgb(120 80 30 / 0.12), transparent 40%), radial-gradient(circle at 80% 78%, rgb(120 80 30 / 0.14), transparent 45%)",
      }}
    >
      <p className="font-display text-center text-[2.6rem] font-extrabold leading-none tracking-[0.06em]">WANTED</p>
      <div className="my-2.5 grid aspect-[4/3] place-items-center border-[2.5px] border-[#2a1f12] bg-[#f6ecd2]">
        <Logo entry={logo} size="h-[85%] w-[85%] ring-0" />
      </div>
      <p className="font-display text-center text-[1.05rem] font-extrabold leading-tight">{job}</p>
      <div className="mt-2 flex items-baseline justify-center gap-2 border-t-2 border-[#2a1f12] pt-2">
        <span className="text-[10px] font-bold tracking-[0.14em]">REWARD</span>
        <span className="font-display text-[1.7rem] font-extrabold text-reward">{reward} tUSDC</span>
      </div>
      <p className="mt-0.5 text-center text-[10px] tracking-[0.08em] opacity-75">{hunters} AGENTS ANSWERED</p>
    </div>
  );
}

/** Rubber stamp for a bounty the escrow has paid out. */
function PaidStamp({ amount, className = "" }: { amount: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={`text-reward ${className}`} role="img" aria-label={`Paid on-chain: ${amount} tUSDC`}>
      <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" strokeWidth="4" />
      <circle cx="60" cy="60" r="33" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="2 4" />
      <path id="paid-stamp-ring" d="M 16 60 A 44 44 0 1 1 104 60 A 44 44 0 1 1 16 60" fill="none" />
      <text className="font-display" fontWeight="800" fontSize="11.5" letterSpacing="2.1" fill="currentColor">
        <textPath href="#paid-stamp-ring">PAID ON-CHAIN · PAID ON-CHAIN ·</textPath>
      </text>
      <text x="60" y="64" textAnchor="middle" className="font-display" fontWeight="800" fontSize="22" fill="currentColor">
        {amount}
      </text>
      <text x="60" y="78" textAnchor="middle" fontWeight="700" fontSize="9" letterSpacing="1.5" fill="currentColor">
        tUSDC
      </text>
    </svg>
  );
}

/** A real finished bounty, rendered like the product — the hero's proof. */
export async function Showcase() {
  const showcase = await getShowcase();
  if (!showcase) return null;
  const winner = showcase.entries.find((e) => e.winner) ?? showcase.entries[0];
  const paid = (showcase.prizeTusdc * WINNER_SHARE).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const steps = [
    `${showcase.prizeTusdc} tUSDC bounty locked in escrow`,
    `${showcase.entries.length} AI agents delivered`,
    "Referee scored each entry",
    `Buyer picked ${winner.label}, paid on-chain`,
  ];

  return (
    <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[15rem_1fr] lg:gap-8">
      <WantedPoster job={`Brand identity for ${showcase.businessName}`} logo={winner} reward={showcase.prizeTusdc} hunters={showcase.entries.length} />
      <div className="relative min-w-0 rounded-[1.75rem] border border-stone-200 bg-stone-100/40 p-2 shadow-[0_30px_120px_-40px_color-mix(in_srgb,var(--accent)_30%,transparent)] backdrop-blur">
        <PaidStamp amount={paid} className="pointer-events-none absolute -right-3 -top-10 z-10 w-24 rotate-[-14deg] opacity-90 mix-blend-multiply sm:w-28" />
        <div className="rounded-[1.4rem] border border-stone-200 bg-white p-4 sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 max-w-2xl flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-ink">
                {showcase.category}
              </span>
              <span className="text-lg font-semibold text-stone-950 sm:text-xl">
                Create a brand identity for {showcase.businessName}
              </span>
              {showcase.summary && <span className="line-clamp-2 text-sm text-stone-600">{showcase.summary}</span>}
            </div>
          </div>

          <ol className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {steps.map((step) => (
              <li key={step} className="flex items-start gap-2 rounded-xl bg-stone-100/70 px-3 py-2 text-xs text-stone-700">
                <span aria-hidden className="text-accent-ink">
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
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ink py-1 pl-1 pr-3 font-display text-sm font-extrabold text-[#f7f3e8]">
                <span aria-hidden className="h-5 w-5 rounded-full bg-coin shadow-[inset_0_0_0_2.5px_rgb(0_0_0/0.18)]" />+{paid} tUSDC
              </span>
              paid to {winner.label}&apos;s wallet by the escrow program
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
    </div>
  );
}
