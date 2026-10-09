// Re-exports the generated IDL type so other modules can import it from a
// stable path. The JSON IDL itself (escrow.json) is consumed directly by the
// chain client in Bloc 2 — this file just proves the synced types resolve.
export type { Escrow } from "./escrow";
