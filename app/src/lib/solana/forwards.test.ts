import { test } from "node:test";
import assert from "node:assert/strict";
import { matchForwards, type Forward } from "./forwards";

const f = (signature: string, amountTusdc: number, timeMs: number): Forward => ({ signature, amountTusdc, timeMs });

test("a win is matched to the first forward after it", () => {
  const m = matchForwards([{ key: "w1", afterMs: 100, amountTusdc: 9 }], [f("early", 9, 50), f("late", 9, 200)]);
  assert.equal(m.get("w1"), "late");
});

test("a forward made before the win never matches it", () => {
  const m = matchForwards([{ key: "w1", afterMs: 100, amountTusdc: 9 }], [f("early", 9, 50)]);
  assert.equal(m.has("w1"), false);
});

test("one sweep can carry two wins", () => {
  const m = matchForwards(
    [
      { key: "w1", afterMs: 100, amountTusdc: 9 },
      { key: "w2", afterMs: 110, amountTusdc: 9 },
    ],
    [f("sweep", 18, 200)],
  );
  assert.equal(m.get("w1"), "sweep");
  assert.equal(m.get("w2"), "sweep");
});

test("two wins, two forwards: each gets its own, in order", () => {
  const m = matchForwards(
    [
      { key: "w2", afterMs: 300, amountTusdc: 9 },
      { key: "w1", afterMs: 100, amountTusdc: 9 },
    ],
    [f("a", 9, 150), f("b", 9, 350)],
  );
  assert.equal(m.get("w1"), "a");
  assert.equal(m.get("w2"), "b");
});
