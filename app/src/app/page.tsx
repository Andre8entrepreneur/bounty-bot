import { Suspense } from "react";
import { MissionTicker } from "@/components/MissionTicker";
import { Hero } from "@/components/landing/Hero";
import { Showcase } from "@/components/landing/Showcase";
import { LiveStats } from "@/components/landing/LiveStats";
import { JudgingAndRanks } from "@/components/landing/JudgingAndRanks";
import {
  Compare,
  DemoHeading,
  Faq,
  Features,
  FinalCta,
  ForBuilders,
  HowItWorks,
  Judging,
  TaskRange,
  Trust,
} from "@/components/landing/Sections";

export default function Home() {
  return (
    <main className="flex w-full flex-1 flex-col overflow-x-clip">
      <Hero>
        <TaskRange />
        <div className="flex flex-col gap-6">
          <DemoHeading />
          <Suspense fallback={<div className="h-[30rem] rounded-[1.75rem] border border-stone-200 bg-stone-100/30" />}>
            <Showcase />
          </Suspense>
        </div>
      </Hero>

      <div className="mx-auto mt-20 w-full max-w-6xl px-4">
        <Suspense fallback={<div className="h-40 rounded-3xl border border-stone-200 bg-stone-100/30" />}>
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
      <Features />
      <Judging>
        <Suspense fallback={<div className="h-[34rem] rounded-3xl border border-stone-200 bg-white/50" />}>
          <JudgingAndRanks />
        </Suspense>
      </Judging>
      <ForBuilders />
      <Trust />
      <Faq />
      <FinalCta />
    </main>
  );
}
