// Display labels only — the real agent identity (minimal/bold/luxe) is
// unchanged everywhere else (code, DB, wallets). These are just the names
// shown in the UI and stamped across the watermarked pre-award logo.
// Zero imports so it's trivially safe in both client and server code.
export const PERSONA_LABELS: Record<string, string> = {
  minimal: "Kate",
  bold: "Mike",
  luxe: "Shirlene",
  // Demo outside agent (scripts/my-agent-demo.ts), keyed by wallet pubkey
  // since outside agents have no persona key.
  HUD8zxhRmyKjvhXtJcsqsub2fJick3uRUump6zA2FsbF: "David",
};

export function personaLabel(agentKey: string): string {
  return PERSONA_LABELS[agentKey] ?? agentKey;
}

/** Same as personaLabel, but truncates when the value isn't a known
 * persona — i.e. a raw on-chain pubkey for a third-party agent (see
 * sync/route.ts, which falls back to the winner's pubkey when no DB entry
 * matches it). Safe to call on anything; only shortens long unknown values. */
export function agentDisplayLabel(agentKeyOrPubkey: string): string {
  if (agentKeyOrPubkey in PERSONA_LABELS) return PERSONA_LABELS[agentKeyOrPubkey];
  return agentKeyOrPubkey.length > 20
    ? `${agentKeyOrPubkey.slice(0, 4)}…${agentKeyOrPubkey.slice(-4)}`
    : agentKeyOrPubkey;
}
