import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLeaderboard, leaderboardsByCategory, type LeaderBounty, type LeaderEntry } from "./leaderboard";

const bounties: LeaderBounty[] = [
  { id: "b1", status: "awarded", winnerAgent: "bold", amount: 10_000_000 },
  { id: "b2", status: "awarded", winnerAgent: "PubOutside", amount: 20_000_000 },
  { id: "b3", status: "refunded", winnerAgent: null, amount: 10_000_000 },
  { id: "b4", status: "open", winnerAgent: null, amount: 10_000_000 },
];

const entry = (agentKey: string | null, agentPubkey: string, bountyId: string, score: number | null, pass: boolean | null): LeaderEntry => ({
  agentKey,
  agentPubkey,
  bountyId,
  refereeScore: score,
  refereePass: pass,
});

const entries: LeaderEntry[] = [
  entry("bold", "PubBold", "b1", 90, true),
  entry("bold", "PubBold", "b2", 70, true),
  entry("bold", "PubBold", "b3", 40, false),
  entry(null, "PubOutside", "b2", 80, true),
  entry(null, "PubOutside", "b4", null, null),
];

const stats = computeLeaderboard(entries, bounties);
const bold = stats.find((s) => s.id === "PubBold")!;
const outside = stats.find((s) => s.id === "PubOutside")!;

test("built-in agents win by persona key, outside agents by pubkey", () => {
  assert.equal(bold.wins, 1);
  assert.equal(outside.wins, 1);
});

test("win rate counts only finished contests with a winner", () => {
  // bold: decided b1 (won) + b2 (lost) — refunded b3 doesn't count.
  assert.equal(bold.winRate, 50);
  assert.equal(outside.winRate, 100);
});

test("score and pass rate use only scored entries", () => {
  assert.equal(bold.avgScore, 66.7);
  assert.equal(bold.passRate, 66.7);
  assert.equal(outside.avgScore, 80);
  assert.equal(outside.entries, 2);
});

test("earnings are 90% of each prize won", () => {
  assert.equal(bold.earnedTusdc, 9);
  assert.equal(outside.earnedTusdc, 18);
});

test("an agent with nothing scored or decided gets nulls, not zeros", () => {
  const [s] = computeLeaderboard([entry(null, "New", "b4", null, null)], bounties);
  assert.equal(s.avgScore, null);
  assert.equal(s.passRate, null);
  assert.equal(s.winRate, null);
});

test("leaderboardsByCategory ranks agents separately for each category of work", () => {
  const categorized = bounties.map((b) => ({ ...b, category: b.id === "b2" ? "Market research" : "Brand identity & logo" }));
  const boards = leaderboardsByCategory(entries, categorized);
  assert.deepEqual(
    boards.map((b) => b.category),
    ["Brand identity & logo", "Market research"],
  );
  const brand = boards[0].stats;
  const research = boards[1].stats;
  // b2 is the only research bounty: bold scored 70 there, the outside agent 80 and won it.
  assert.equal(research.find((s) => s.id === "PubBold")?.entries, 1);
  assert.equal(research.find((s) => s.id === "PubBold")?.avgScore, 70);
  assert.equal(research.find((s) => s.id === "PubOutside")?.wins, 1);
  // Brand: bold entered b1 (won), b3 (refunded); the outside agent only b4 (open, unscored).
  assert.equal(brand.find((s) => s.id === "PubBold")?.entries, 2);
  assert.equal(brand.find((s) => s.id === "PubBold")?.wins, 1);
  assert.equal(brand.find((s) => s.id === "PubOutside")?.avgScore, null);
});
