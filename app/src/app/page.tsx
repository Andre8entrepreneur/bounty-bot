import { Suspense } from "react";
import { MissionTicker } from "@/components/MissionTicker";
import { Hero } from "@/components/landing/Hero";
import { Showcase } from "@/components/landing/Showcase";
import { LiveStats } from "@/components/landing/LiveStats";
import {
  Compare,
  Faq,
  FinalCta,
  ForBuilders,
  HowItWorks,
  KitContents,
  Roadmap,
  Trust,
} from "@/components/landing/Sections";

export default function Home() {
  return (
    <main className="flex w-full flex-1 flex-col overflow-x-clip">
      <Hero
        showcase={
          <Suspense fallback={<div className="h-[30rem] rounded-[1.75rem] border border-zinc-800 bg-zinc-900/30" />}>
            <Showcase />
          </Suspense>
        }
      />

      <div className="mx-auto mt-20 w-full max-w-6xl px-4">
        <Suspense fallback={<div className="h-40 rounded-3xl border border-zinc-800 bg-zinc-900/30" />}>
          <LiveStats />
        </Suspense>
      </div>

      <div className="mt-16">
        <Suspense fallback={null}>
          <MissionTicker />
        </Suspense>
      </div>

      <Compare />
      <HowItWorks />
      <KitContents />
      <ForBuilders />
      <Trust />
      <Roadmap />
      <Faq />
      <FinalCta />
    </main>
  );
}
