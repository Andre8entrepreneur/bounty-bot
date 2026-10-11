import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentSettingsSchema, NO_RULES, joinDecision, type BountyFacts } from "./agent-settings";

const bounty: BountyFacts = {
  prizeTusdc: 10,
  category: "brand",
  models: [
    { id: "gpt-6-astra", costShareOfPayout: 0.012 },
    { id: "deepseek-v4-pro", costShareOfPayout: 0.001 },
  ],
};

test("an agent with no rules joins every bounty", () => {
  assert.deepEqual(joinDecision(NO_RULES, bounty), { join: true });
});

test("minimum bounty: skips anything below it, joins at or above it", () => {
  const rules = { ...NO_RULES, minBountyTusdc: 20 };
  const skipped = joinDecision(rules, bounty);
  assert.equal(skipped.join, false);
  assert.match(!skipped.join ? skipped.reason : "", /10 tUSDC is under your 20 tUSDC minimum/);
  assert.deepEqual(joinDecision(rules, { ...bounty, prizeTusdc: 20 }), { join: true });
});

test("own fields only: skips bounties outside the agent's fields", () => {
  const rules = { ...NO_RULES, fields: ["research" as const], ownFieldsOnly: true };
  const skipped = joinDecision(rules, bounty);
  assert.equal(skipped.join, false);
  assert.match(!skipped.join ? skipped.reason : "", /Brand identity & logo/);
  assert.deepEqual(joinDecision(rules, { ...bounty, category: "research" }), { join: true });
  // Fields listed but the switch off: the agent still joins anything.
  assert.deepEqual(joinDecision({ ...rules, ownFieldsOnly: false }, bounty), { join: true });
});

test("cost limit: judged on the agent's own model when it's set", () => {
  const rules = { ...NO_RULES, maxCostPct: 0.5, model: "deepseek-v4-pro" };
  assert.deepEqual(joinDecision(rules, bounty), { join: true });
  const pricey = joinDecision({ ...rules, model: "gpt-6-astra" }, bounty);
  assert.equal(pricey.join, false);
  assert.match(!pricey.join ? pricey.reason : "", /1\.2% of the payout, over your 0\.5% limit/);
});

test("cost limit without a model falls back to the priciest flagship", () => {
  const decision = joinDecision({ ...NO_RULES, maxCostPct: 1 }, bounty);
  assert.equal(decision.join, false);
});

test("settings validation: unknown models and out-of-range limits are refused", () => {
  const ok = {
    specialty: "Ramen-bar branding",
    description: "Warm, hand-drawn identities for restaurants.",
    fields: ["brand", "brand", "social"],
    model: "claude-opus-5-5",
    minBountyTusdc: 5,
    maxCostPct: 10,
    ownFieldsOnly: true,
  };
  const parsed = AgentSettingsSchema.parse(ok);
  assert.deepEqual(parsed.fields, ["brand", "social"]);
  assert.equal(AgentSettingsSchema.safeParse({ ...ok, model: "made-up-model" }).success, false);
  assert.equal(AgentSettingsSchema.safeParse({ ...ok, maxCostPct: 0 }).success, false);
  assert.equal(AgentSettingsSchema.safeParse({ ...ok, fields: ["astrology"] }).success, false);
  assert.equal(AgentSettingsSchema.safeParse({ ...ok, description: "x".repeat(281) }).success, false);
});
