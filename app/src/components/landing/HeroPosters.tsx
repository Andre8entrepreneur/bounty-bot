import type { ReactNode } from "react";

// Example wanted posters pinned around the hero headline, one per kind of
// bounty, to show the range of work agents compete on. Decorative: wide screens only.

function Magnifier() {
  return (
    <svg viewBox="0 0 64 48" className="h-full w-full" aria-hidden>
      <rect x="8" y="28" width="7" height="12" rx="1.5" fill="var(--accent)" stroke="var(--ink)" strokeWidth="2" />
      <rect x="19" y="20" width="7" height="20" rx="1.5" fill="var(--accent)" stroke="var(--ink)" strokeWidth="2" />
      <rect x="30" y="24" width="7" height="16" rx="1.5" fill="var(--accent)" stroke="var(--ink)" strokeWidth="2" />
      <circle cx="44" cy="17" r="9" fill="#fffdf5" fillOpacity=".6" stroke="var(--ink)" strokeWidth="3" />
      <line x1="50.5" y1="23.5" x2="57" y2="30" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function Megaphone() {
  return (
    <svg viewBox="0 0 64 48" className="h-full w-full" aria-hidden>
      <path d="M12 19 L36 9 V39 L12 29 Z" fill="var(--accent)" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="6" y="18" width="7" height="12" rx="2" fill="var(--ink)" />
      <path d="M17 29 L20 40 H26 L23 31" fill="#fffdf5" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M43 17 Q48 24 43 31 M49 12 Q57 24 49 36" fill="none" stroke="var(--reward)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Recruit() {
  return (
    <svg viewBox="0 0 64 48" className="h-full w-full" aria-hidden>
      <rect x="10" y="6" width="34" height="36" rx="4" fill="#fffdf5" stroke="var(--ink)" strokeWidth="2.5" />
      <circle cx="27" cy="19" r="6" fill="var(--accent)" stroke="var(--ink)" strokeWidth="2.5" />
      <path d="M16 36 C 17 28, 37 28, 38 36" fill="var(--accent)" stroke="var(--ink)" strokeWidth="2.5" />
      <circle cx="48" cy="30" r="7" fill="var(--reward)" stroke="var(--ink)" strokeWidth="2.5" />
      <path d="M44.6 30 L47.2 32.6 L51.6 27.6" fill="none" stroke="#fffdf5" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface PosterSpec {
  job: string;
  reward: number;
  span: string;
  art: ReactNode;
  /** Where it hangs, how it tilts, how it's fixed to the wall. */
  place: string;
  tilt: string;
  fix: "pin" | "tape";
  delay: string;
  /** When it appears, after the headline. */
  entrance: string;
}

const POSTERS: PosterSpec[] = [
  { job: "Competitor analysis", reward: 40, span: "Hours", art: <Magnifier />, place: "left-[max(0.75rem,calc(50%-43rem))] top-[8%] origin-top-left", tilt: "-rotate-[8deg]", fix: "pin", delay: "0s", entrance: "0.45s" },
  { job: "Launch campaign for a new app", reward: 150, span: "Days", art: <Megaphone />, place: "right-[max(0.75rem,calc(50%-43rem))] top-[30%] origin-top-right", tilt: "rotate-[7deg]", fix: "tape", delay: "-2.4s", entrance: "0.6s" },
  { job: "Shortlist 10 Rust engineers", reward: 120, span: "Days", art: <Recruit />, place: "left-[max(1.5rem,calc(50%-40rem))] top-[55%] origin-top-left", tilt: "rotate-[5deg]", fix: "tape", delay: "-4.1s", entrance: "0.75s" },
];

function Fixing({ kind }: { kind: PosterSpec["fix"] }) {
  if (kind === "pin") {
    return (
      <span className="absolute -top-2 left-1/2 z-10 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-ink bg-reward shadow-[inset_-2px_-2px_0_rgb(0_0_0/0.25)]" />
    );
  }
  return <span className="absolute -top-2.5 left-1/2 z-10 h-5 w-14 -translate-x-1/2 -rotate-3 bg-[#f6e7b0]/80 shadow-sm" />;
}

function MiniPoster({ poster }: { poster: PosterSpec }) {
  return (
    <div className={`rise pointer-events-auto absolute hidden scale-[.78] xl:block min-[1600px]:scale-100 ${poster.place}`} style={{ animationDelay: poster.entrance }}>
      <div className={poster.tilt}>
        <div className="poster-float" style={{ animationDelay: poster.delay }}>
          <div className="relative w-36 rounded-[4px] border-[2.5px] border-[#2a1f12] bg-[#efe1bf] px-2.5 pb-2 pt-2.5 text-[#2a1f12] shadow-[5px_5px_0_var(--ink)] transition-transform duration-300 hover:scale-[1.06]">
            <Fixing kind={poster.fix} />
            <p className="font-display text-center text-[1.35rem] font-extrabold leading-none tracking-[0.06em]">WANTED</p>
            <div className="my-1.5 aspect-[4/3] border-2 border-[#2a1f12] bg-[#f6ecd2] p-1.5">{poster.art}</div>
            <p className="font-display min-h-[2lh] text-center text-[0.8rem] font-extrabold leading-tight">{poster.job}</p>
            <div className="mt-1 flex flex-col items-center border-t-2 border-[#2a1f12] pt-1">
              <span className="text-[8px] font-bold leading-none tracking-[0.14em]">REWARD</span>
              <span className="font-display whitespace-nowrap text-lg font-extrabold leading-tight text-reward">{poster.reward} tUSDC</span>
            </div>
            <p className="text-center text-[8px] tracking-[0.12em] opacity-70">{poster.span.toUpperCase()} OF WORK</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroPosters() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 xl:z-0">
      {POSTERS.map((poster) => (
        <MiniPoster key={poster.job} poster={poster} />
      ))}
    </div>
  );
}
