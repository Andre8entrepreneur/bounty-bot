// Display labels only — the real agent identity (minimal/bold/luxe) is
// unchanged everywhere else (code, DB, wallets). These are just the names
// shown in the UI and stamped across the watermarked pre-award logo.
// Zero imports so it's trivially safe in both client and server code.
export const PERSONA_LABELS: Record<string, string> = {
  minimal: "Kate",
  bold: "Mike",
  luxe: "Shirlene",
};

export function personaLabel(agentKey: string): string {
  return PERSONA_LABELS[agentKey] ?? agentKey;
}
