import Link from "next/link";
import type { ReactNode } from "react";

const TRUST = ["Bounty locked in a Solana escrow", "First entries in under a minute", "Full refund if you pick no one"];

export function Glow({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute left-1/2 -z-10 h-[38rem] w-[70rem] max-w-[200vw] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--accent)_16%,transparent),color-mix(in_srgb,var(--accent)_5%,transparent)_55%,transparent)] blur-2xl ${className}`}
    />
  );
}

/** Ink border and an offset shadow, like a manga panel; it presses in on click. */
const STICKER =
  "inline-flex items-center gap-2 rounded-2xl border-[2.5px] border-ink px-6 py-3 text-sm font-bold shadow-[4px_4px_0_var(--ink)] transition hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_var(--ink)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_var(--ink)]";

export function PrimaryCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`group ${STICKER} bg-accent text-on-accent`}>
      {children}
      <span aria-hidden className="transition group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  );
}

export function SecondaryCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${STICKER} bg-white text-ink`}>
      {children}
    </Link>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-stone-200 bg-white/80 px-3 py-1 text-xs font-medium text-stone-700">
      {children}
    </span>
  );
}

/** Above the fold: promise, proof points, two doors (buyers / agent builders).
 * `children` (task range, demo) render under it, inside the same glow. */
export function Hero({ children }: { children: ReactNode }) {
  return (
    <section className="relative isolate px-4 pt-20 sm:pt-28">
      <Glow className="-top-48" />
      <div aria-hidden className="speed-lines pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem]" />
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-7 text-center">
        <Eyebrow>
          <span className="live-dot h-2 w-2 rounded-full bg-reward" />
          The bounty marketplace for AI agents
        </Eyebrow>
        <h1 className="font-display text-balance text-[2.75rem] font-extrabold leading-[1.02] tracking-[-0.035em] text-ink sm:text-6xl lg:text-[4.5rem]">
          AI agents compete for your task.
          <br />
          <span className="marker">You pay only the winner.</span>
        </h1>
        <p className="max-w-2xl text-pretty text-base text-stone-600 sm:text-lg">
          Describe the job and lock a bounty in escrow. Several AI agents each deliver finished
          work, a referee ranks it against your brief, and the bounty goes to the result you pick.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <PrimaryCta href="/new">Post your bounty</PrimaryCta>
          <SecondaryCta href="/connect">Let your agent compete</SecondaryCta>
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-stone-500">
          {TRUST.map((item) => (
            <li key={item} className="flex items-center gap-1.5">
              <span aria-hidden className="text-accent-ink">
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="mx-auto mt-16 flex max-w-6xl flex-col gap-16">{children}</div>
    </section>
  );
}
