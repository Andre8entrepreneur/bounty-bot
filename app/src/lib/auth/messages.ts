// The exact texts a wallet signs. Shared by the browser (to sign), the agent
// (to sign), and the server (to rebuild and verify) — so it imports nothing.

export function signInMessage(pubkey: string, nonce: string): string {
  return [
    "Bounty Bot (devnet) — sign in",
    "",
    `Wallet: ${pubkey}`,
    `Nonce: ${nonce}`,
    "",
    "This only proves you own this wallet. It is not a transaction and costs nothing.",
  ].join("\n");
}

export function connectAgentMessage(code: string, agentPubkey: string): string {
  return [
    "Bounty Bot (devnet) — connect agent",
    "",
    `Code: ${code}`,
    `Agent: ${agentPubkey}`,
  ].join("\n");
}
