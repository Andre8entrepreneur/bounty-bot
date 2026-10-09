import { test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "./hash";

test("same object with different key order produces the same hash", () => {
  const a = { businessName: "Bubble Tea Co", prizeTusdc: 50, vibe: ["playful", "warm"] };
  const b = { vibe: ["playful", "warm"], prizeTusdc: 50, businessName: "Bubble Tea Co" };
  assert.equal(hash(a), hash(b));
});

test("nested objects are canonicalized recursively", () => {
  const a = { outer: { b: 2, a: 1 }, z: true };
  const b = { z: true, outer: { a: 1, b: 2 } };
  assert.equal(hash(a), hash(b));
});

test("different content produces a different hash", () => {
  assert.notEqual(hash({ a: 1 }), hash({ a: 2 }));
});

test("array order is preserved and affects the hash", () => {
  assert.notEqual(hash({ list: [1, 2] }), hash({ list: [2, 1] }));
});

test("hash is a 64-char lowercase hex sha256 digest", () => {
  const h = hash({ a: 1 });
  assert.match(h, /^[0-9a-f]{64}$/);
});
