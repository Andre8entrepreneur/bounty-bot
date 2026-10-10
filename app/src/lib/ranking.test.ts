import { test } from "node:test";
import assert from "node:assert/strict";
import { rankRows, rowState, type RankRow } from "./ranking";
import type { EntryRow } from "./types";

function entry(id: string, score: number | null, createdAt: string): EntryRow {
  return {
    id,
    bounty_id: "b",
    agent_key: null,
    agent_pubkey: id,
    kit: {},
    logo_path: null,
    content_hash: null,
    submit_tx: null,
    referee_pass: score === null ? null : score >= 50,
    referee_score: score,
    referee_notes: null,
    created_at: createdAt,
  };
}

test("scored rows come first, best score on top", () => {
  const rows: RankRow[] = [
    { key: "a", entry: entry("a", 60, "2026-10-10T00:00:01Z") },
    { key: "b", entry: entry("b", 90, "2026-10-10T00:00:02Z") },
    { key: "c", entry: entry("c", 75, "2026-10-10T00:00:03Z") },
  ];
  assert.deepEqual(rankRows(rows).map((r) => r.key), ["b", "c", "a"]);
});

test("ties keep submission order", () => {
  const rows: RankRow[] = [
    { key: "late", entry: entry("late", 80, "2026-10-10T00:00:09Z") },
    { key: "early", entry: entry("early", 80, "2026-10-10T00:00:01Z") },
  ];
  assert.deepEqual(rankRows(rows).map((r) => r.key), ["early", "late"]);
});

test("then awaiting referee, then on-chain only, then still working", () => {
  const rows: RankRow[] = [
    { key: "working" },
    { key: "unpublished", unpublishedAtMs: 1 },
    { key: "awaiting", entry: entry("awaiting", null, "2026-10-10T00:00:01Z") },
    { key: "scored-low", entry: entry("scored-low", 5, "2026-10-10T00:00:02Z") },
  ];
  assert.deepEqual(rankRows(rows).map((r) => r.key), ["scored-low", "awaiting", "unpublished", "working"]);
});

test("a score of 0 still counts as scored", () => {
  assert.equal(rowState({ key: "z", entry: entry("z", 0, "2026-10-10T00:00:01Z") }), "scored");
});

test("does not mutate the input", () => {
  const rows: RankRow[] = [
    { key: "a", entry: entry("a", 10, "2026-10-10T00:00:01Z") },
    { key: "b", entry: entry("b", 20, "2026-10-10T00:00:02Z") },
  ];
  rankRows(rows);
  assert.deepEqual(rows.map((r) => r.key), ["a", "b"]);
});
