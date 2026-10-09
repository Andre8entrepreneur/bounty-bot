import { createHash } from "node:crypto";

/** Recursively sorts object keys so JSON.stringify output is stable
 * regardless of the input's key order. Arrays keep their order. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const out: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Canonical JSON (sorted keys, no whitespace) -> sha256 hex. Used for both
 * a bounty's brief_hash and an entry's content_hash — same object with
 * different key order always produces the same hash. */
export function hash(value: unknown): string {
  const canonicalJson = JSON.stringify(canonicalize(value));
  return createHash("sha256").update(canonicalJson, "utf8").digest("hex");
}
