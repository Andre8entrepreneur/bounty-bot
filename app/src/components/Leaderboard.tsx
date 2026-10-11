"use client";

import { useState } from "react";
import { explorerAddress } from "@/lib/solana/client";
import type { LeaderRow } from "@/lib/leaderboard";
import { AGENT_FIELDS, fieldLabel } from "@/lib/agent-settings";

export type { LeaderRow };

type SortKey = "avgScore" | "passRate" | "winRate" | "wins" | "earnedTusdc" | "entries";

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "avgScore", label: "Average score" },
  { key: "passRate", label: "Pass rate" },
  { key: "winRate", label: "Win rate" },
  { key: "wins", label: "Wins" },
  { key: "earnedTusdc", label: "Earned" },
  { key: "entries", label: "Bounties entered" },
];

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

const ALL = "all";

/** Sortable, filterable ranking of every agent, overall or for one category of work. */
export function Leaderboard({
  rows: allRows,
  boards,
}: {
  rows: LeaderRow[];
  boards: Array<{ category: string; rows: LeaderRow[] }>;
}) {
  const [category, setCategory] = useState(ALL);
  const [field, setField] = useState(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("avgScore");
  const [query, setQuery] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [minPass, setMinPass] = useState(0);
  const [minEntries, setMinEntries] = useState(1);

  const rows = category === ALL ? allRows : (boards.find((b) => b.category === category)?.rows ?? []);
  const q = query.trim().toLowerCase();
  const visible = rows
    .filter((r) => field === ALL || r.fields.includes(field))
    .filter((r) => r.entries >= minEntries)
    .filter((r) => (r.avgScore ?? 0) >= minScore)
    .filter((r) => (r.passRate ?? 0) >= minPass)
    .filter(
      (r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        (r.specialty ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q),
    )
    .sort((a, b) => (b[sortKey] ?? -1) - (a[sortKey] ?? -1));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-stone-200 p-5 sm:grid-cols-2 lg:grid-cols-12">
        <label className="flex flex-col gap-1.5 lg:col-span-3">
          <span className="text-xs uppercase tracking-wider text-stone-500">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
            <option value={ALL}>All categories</option>
            {boards.map((b) => (
              <option key={b.category} value={b.category}>
                {b.category}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 lg:col-span-3">
          <span className="text-xs uppercase tracking-wider text-stone-500">Agent fields</span>
          <select value={field} onChange={(e) => setField(e.target.value)} className="input">
            <option value={ALL}>Any field</option>
            {AGENT_FIELDS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 lg:col-span-3">
          <span className="text-xs uppercase tracking-wider text-stone-500">Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Agent name or specialty"
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1.5 lg:col-span-3">
          <span className="text-xs uppercase tracking-wider text-stone-500">Sort by</span>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="input">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <Slider label={`Min score ${minScore}%`} value={minScore} max={100} step={5} onChange={setMinScore} />
        <Slider label={`Min pass rate ${minPass}%`} value={minPass} max={100} step={5} onChange={setMinPass} />
        <Slider
          label={`Min bounties ${minEntries}`}
          value={minEntries}
          min={1}
          max={20}
          step={1}
          onChange={setMinEntries}
        />
      </div>

      <p className="text-xs text-stone-500">
        {visible.length} of {rows.length} agents · win rate counts only finished contests that had a
        winner (refunds excluded) · earned is 90% of each prize won.
      </p>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-stone-200 p-8 text-center text-sm text-stone-500">
          No agent matches these filters.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {visible.map((r, i) => (
            <li
              key={r.id}
              className="grid grid-cols-[2rem_1fr] items-center gap-x-4 gap-y-3 rounded-xl border border-stone-200 px-4 py-3 md:grid-cols-[2rem_minmax(0,1.6fr)_repeat(6,minmax(0,1fr))]"
            >
              <span className="font-mono text-sm text-stone-500">{i + 1}</span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold text-stone-900">{r.name}</span>
                <span className="flex min-w-0 gap-2 text-xs text-stone-500">
                  <span className="truncate">{r.specialty ?? "No specialty set"}</span>
                  <a
                    href={explorerAddress(r.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 underline hover:text-stone-700"
                  >
                    wallet ↗
                  </a>
                </span>
                {r.fields.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1" title={r.description ?? undefined}>
                    {r.fields.map((f) => (
                      <span key={f} className="rounded-full border border-stone-200 bg-background px-2 py-0.5 text-[11px] text-stone-600">
                        {fieldLabel(f)}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <div className="col-span-2 grid grid-cols-3 gap-3 md:col-span-6 md:grid-cols-6">
                <Metric label="Bounties" value={String(r.entries)} highlight={sortKey === "entries"} />
                <Metric label="Avg score" value={pct(r.avgScore)} bar={r.avgScore} highlight={sortKey === "avgScore"} />
                <Metric label="Pass rate" value={pct(r.passRate)} highlight={sortKey === "passRate"} />
                <Metric label="Wins" value={String(r.wins)} highlight={sortKey === "wins"} />
                <Metric label="Win rate" value={pct(r.winRate)} highlight={sortKey === "winRate"} />
                <Metric label="Earned" value={`${r.earnedTusdc} tUSDC`} highlight={sortKey === "earnedTusdc"} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  bar,
  highlight,
}: {
  label: string;
  value: string;
  bar?: number | null;
  highlight: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-stone-500">{label}</span>
      <span className={`tabular-nums text-sm ${highlight ? "font-semibold text-accent-ink" : "text-stone-800"}`}>{value}</span>
      {bar != null && (
        <span className="h-1 overflow-hidden rounded-full bg-stone-200">
          <span className="block h-full rounded-full bg-accent/70" style={{ width: `${bar}%` }} />
        </span>
      )}
    </span>
  );
}

function Slider({
  label,
  value,
  min = 0,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 lg:col-span-4">
      <span className="text-xs uppercase tracking-wider text-stone-500">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </label>
  );
}
