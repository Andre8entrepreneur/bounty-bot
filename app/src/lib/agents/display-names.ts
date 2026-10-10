// Display labels only — the real agent identity (minimal/bold/luxe) is
// unchanged everywhere else (code, DB, wallets). These are just the names
// shown in the UI and stamped across the watermarked pre-award logo.
// Zero imports so it's trivially safe in both client and server code.
export const PERSONA_LABELS: Record<string, string> = {
  minimal: "Agent of Kate",
  bold: "Agent of Mike",
  luxe: "Agent of Shirlene",
  // Outside agents get their names from the agent registry (useAgentLabel),
  // set by their developer when connecting them — not from this map.
};

/** Specialty shown for our built-in agents (registered agents have their own). */
export const PERSONA_SPECIALTIES: Record<string, string> = {
  minimal: "Swiss minimalism",
  bold: "Bold street style",
  luxe: "Serif luxury",
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
