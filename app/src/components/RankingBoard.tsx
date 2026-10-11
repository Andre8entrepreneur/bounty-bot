"use client";

import { useEffect, useRef, useState } from "react";
import type { BrandKit } from "@/lib/agents/schema";
import { useAgentLabel } from "@/hooks/useAgentLabel";
import type { EntryRow } from "@/lib/types";
import { rankRows, rowState, type RankRow } from "@/lib/ranking";
import { AgentCard } from "./AgentCard";
import { BrandBoard } from "./BrandBoard";
import { ExternalEntryCard } from "./ExternalEntryCard";

export function RankingBoard({
  rows,
  winnerKey,
  minScore,
  canPick,
  picking,
  onPick,
}: {
  rows: RankRow[];
  /** bounty.winner_agent once awarded, else null. */
  winnerKey: string | null;
  minScore: number;
  /** Connected wallet is the buyer and the pick window is open. */
  canPick: boolean;
  picking: string | null;
  onPick: (entry: EntryRow) => void;
}) {
  const ranked = rankRows(rows);
  const labelFor = useAgentLabel();
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const selectedIndex = selectedKey ? ranked.findIndex((r) => r.key === selectedKey) : -1;
  const selected = selectedIndex >= 0 ? ranked[selectedIndex] : null;

  // The parent re-renders every second (countdown), so read the current order
  // through a ref instead of re-binding the key listener on every tick.
  const rankedKeysRef = useRef<string[]>([]);
  useEffect(() => {
    rankedKeysRef.current = ranked.map((r) => r.key);
  });

  function step(delta: number) {
    setSelectedKey((current) => {
      const keys = rankedKeysRef.current;
      const index = current ? keys.indexOf(current) : -1;
      if (index < 0) return current;
      return keys[(index + delta + keys.length) % keys.length];
    });
  }

  const isOpen = selectedKey !== null;
  useEffect(() => {
    if (!isOpen) return;
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedKey(null);
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  if (selected) {
    const isWinner = winnerKey === selected.key;
    const pickable = canPick ? selected.entry : undefined;
    return (
      <div ref={topRef} className="flex scroll-mt-20 flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => setSelectedKey(null)}
            className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-800 hover:border-stone-500"
          >
            ← Back to ranking
          </button>
          <div className="flex items-center gap-2 text-sm text-stone-600">
            <button
              onClick={() => step(-1)}
              className="rounded-full border border-stone-200 px-3 py-1.5 hover:border-stone-400"
              aria-label="Previous submission"
            >
              ‹ Previous
            </button>
            <span className="tabular-nums">
              {selectedIndex + 1} / {ranked.length}
            </span>
            <button
              onClick={() => step(1)}
              className="rounded-full border border-stone-200 px-3 py-1.5 hover:border-stone-400"
              aria-label="Next submission"
            >
              Next ›
            </button>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          {selected.entry || rowState(selected) === "working" ? (
            <AgentCard
              agentKey={selected.key}
              label={labelFor(selected.key)}
              entry={selected.entry}
              revealed={isWinner}
            />
          ) : (
            <ExternalEntryCard
              agentPubkey={selected.key}
              submittedAtMs={selected.unpublishedAtMs ?? 0}
              won={isWinner}
            />
          )}

          {pickable && (
            <div className="flex flex-col gap-2">
              {pickable.referee_pass === false && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
                  This entry scored below your pass mark ({minScore}%). You can still pick it.
                </p>
              )}
              <button
                onClick={() => onPick(pickable)}
                disabled={picking !== null}
                className="rounded-full bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {picking === pickable.id
                  ? "Confirm in wallet…"
                  : `Pick ${labelFor(selected.key)} — pay the prize`}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const hovered = ranked.find((r) => r.key === hoveredKey) ?? null;

  return (
    <div ref={topRef} className="grid scroll-mt-20 grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1 text-xs uppercase tracking-wider text-stone-500">
          <span>Ranking</span>
          <span>Pass mark {minScore}%</span>
        </div>
        <ol className="flex flex-col gap-2" onMouseLeave={() => setHoveredKey(null)}>
          {ranked.map((row, i) => (
            <RankLine
              key={row.key}
              row={row}
              label={labelFor(row.key)}
              rank={rowState(row) === "scored" ? i + 1 : null}
              minScore={minScore}
              isWinner={winnerKey === row.key}
              onHover={() => setHoveredKey(row.key)}
              onOpen={() => setSelectedKey(row.key)}
            />
          ))}
        </ol>
        <p className="px-1 text-xs text-stone-500">
          Click a row for the full kit{canPick ? " and to pick a winner" : ""}.
        </p>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-20">
          {hovered ? (
            <PreviewPanel row={hovered} label={labelFor(hovered.key)} isWinner={winnerKey === hovered.key} />
          ) : (
            <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-stone-200 p-6 text-center text-sm text-stone-500">
              Hover a row to preview its kit
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function RankLine({
  row,
  label,
  rank,
  minScore,
  isWinner,
  onHover,
  onOpen,
}: {
  row: RankRow;
  label: string;
  rank: number | null;
  minScore: number;
  isWinner: boolean;
  onHover: () => void;
  onOpen: () => void;
}) {
  const state = rowState(row);
  const kit = row.entry?.kit as BrandKit | undefined;
  const score = row.entry?.referee_score ?? null;

  return (
    <li>
      <button
        onMouseEnter={onHover}
        onFocus={onHover}
        onClick={onOpen}
        className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition hover:border-stone-400 hover:bg-stone-100/60 ${
          isWinner ? "border-accent/50 bg-accent/5" : "border-stone-200"
        }`}
      >
        <span className="w-6 shrink-0 text-center font-mono text-sm text-stone-500">
          {rank ?? "–"}
        </span>

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-stone-900">
            {label}
            {isWinner && (
              <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                Winner
              </span>
            )}
          </span>
          <span className="truncate text-xs text-stone-500">
            {state === "working" && <span className="animate-pulse">working…</span>}
            {state === "unpublished" && "submitted on-chain · kit not published"}
            {state === "awaiting" && `${kit?.names[0] ?? "Kit"} · awaiting referee`}
            {state === "scored" && (kit?.names[0] ?? "Kit")}
          </span>
        </span>

        {score !== null && (
          <span className="hidden w-32 shrink-0 sm:block" aria-hidden>
            <span className="relative block h-1.5 rounded-full bg-stone-200">
              <span
                className={`absolute inset-y-0 left-0 rounded-full ${row.entry?.referee_pass ? "bg-accent/80" : "bg-red-400/70"}`}
                style={{ width: `${score}%` }}
              />
              <span
                className="absolute -top-1 h-3.5 w-px bg-stone-600"
                style={{ left: `${minScore}%` }}
                title={`Pass mark ${minScore}%`}
              />
            </span>
          </span>
        )}

        {score !== null && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
              row.entry?.referee_pass ? "bg-accent/10 text-accent" : "bg-red-500/10 text-red-600"
            }`}
          >
            {score}% · {row.entry?.referee_pass ? "Pass" : "Failed"}
          </span>
        )}
      </button>
    </li>
  );
}

function PreviewPanel({ row, label, isWinner }: { row: RankRow; label: string; isWinner: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-600">{label}</h3>
      {row.entry ? (
        <BrandBoard kit={row.entry.kit as BrandKit} revealed={isWinner} watermark={label} />
      ) : (
        <p className="py-8 text-center text-sm text-stone-500">
          {row.unpublishedAtMs !== undefined ? "Kit not published yet." : "Still designing…"}
        </p>
      )}
    </div>
  );
}
