import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MODEL_PRICES,
  breakEvenLabel,
  briefTokens,
  calibrate,
  costFor,
  estimateMissionTokens,
  estimateModelCosts,
  formatShare,
  verdictFor,
} from "./cost-estimate";

const model = (id: string) => {
  const found = MODEL_PRICES.find((m) => m.id === id);
  assert.ok(found, `missing model ${id}`);
  return found;
};

test("prices: each provider's flagship, plus the model our agents run", () => {
  assert.deepEqual(
    MODEL_PRICES.map((m) => m.id),
    ["claude-fable-5-1", "gpt-6-astra", "kimi-k3", "gemini-3.1-pro-preview", "grok-4.7", "deepseek-v4-pro", "claude-opus-5-5"],
  );
});

test("calibrate: seed runs alone give their medians", () => {
  const c = calibrate();
  assert.equal(c.overheadTokens, 2493);
  assert.equal(c.outputTokens, 1617);
  assert.equal(c.runs, 18);
});

test("calibrate: live runs move the median, outliers don't dominate", () => {
  const c = calibrate([
    { overheadTokens: 9000, outputTokens: 9000 },
    { overheadTokens: 9000, outputTokens: 9000 },
  ]);
  assert.equal(c.runs, 20);
  // 20 sorted samples: the median moves from the 9th/10th to the 10th/11th
  // (overheads there are all 2493; outputs (1620 + 1717) / 2)
  assert.equal(c.overheadTokens, 2493);
  assert.equal(c.outputTokens, 1669);
});

test("estimateMissionTokens: input grows with the brief, output doesn't", () => {
  const c = calibrate();
  const bigBrief = { businessName: "A", whatItDoes: "x".repeat(4000) };
  const small = estimateMissionTokens({ businessName: "A" }, c);
  const big = estimateMissionTokens(bigBrief, c);
  // 4000 chars of text plus `,"whatItDoes":""` (16 chars) → 1004 tokens more
  assert.equal(big.inputTokens - small.inputTokens, 1004);
  assert.equal(big.inputTokens, c.overheadTokens + briefTokens(bigBrief));
  assert.equal(small.outputTokens, big.outputTokens);
  assert.equal(small.inputTokens, c.overheadTokens + briefTokens({ businessName: "A" }));
});

test("costFor: per-million pricing on input and output", () => {
  const cost = costFor({ inputTokens: 3000, outputTokens: 1750 }, model("grok-4.7"));
  // 3000 × $2/M + 1750 × $6/M = 0.006 + 0.0105
  assert.ok(Math.abs(cost - 0.0165) < 1e-9);
});

test("estimateModelCosts: priced against the 90% winner payout", () => {
  const costs = estimateModelCosts({ inputTokens: 3000, outputTokens: 1750 }, 10);
  assert.equal(costs.length, MODEL_PRICES.length);
  const fable = costs.find((c) => c.model.id === "claude-fable-5-1");
  assert.ok(fable);
  assert.ok(Math.abs(fable.costShare - fable.costUsd / 9) < 1e-12);
  assert.equal(fable.verdict, "worth-it");
});

test("estimateModelCosts: a tiny prize flips expensive models to skip", () => {
  const costs = estimateModelCosts({ inputTokens: 3000, outputTokens: 1750 }, 0.2);
  assert.equal(costs.find((c) => c.model.id === "gpt-6-astra")?.verdict, "skip");
  assert.equal(costs.find((c) => c.model.id === "deepseek-v4-pro")?.verdict, "worth-it");
});

test("estimateModelCosts: no prize means nothing is worth it", () => {
  for (const c of estimateModelCosts({ inputTokens: 3000, outputTokens: 1750 }, null)) {
    assert.equal(c.verdict, "skip");
    assert.equal(c.costShare, Number.POSITIVE_INFINITY);
  }
});

test("verdictFor: thresholds at 10% and 30%", () => {
  assert.equal(verdictFor(0.1), "worth-it");
  assert.equal(verdictFor(0.1001), "tight");
  assert.equal(verdictFor(0.3), "tight");
  assert.equal(verdictFor(0.31), "skip");
});

test("labels", () => {
  assert.equal(breakEvenLabel(0.01), "win 1 in 100");
  assert.equal(breakEvenLabel(1.5), "can't — costs more than the payout");
  assert.equal(formatShare(0.0005), "<0.1%");
  assert.equal(formatShare(0.013), "1.3%");
  assert.equal(formatShare(0.25), "25%");
  assert.equal(formatShare(Number.POSITIVE_INFINITY), "—");
});
