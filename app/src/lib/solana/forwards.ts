import { PublicKey, type Connection, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

/** A connector forward: tUSDC moved from an agent's token account to its
 * owner's (the escrow pays the agent; the connector passes it on). */
export interface Forward {
  signature: string;
  amountTusdc: number;
  timeMs: number;
}

interface TransferInfo {
  source?: string;
  destination?: string;
  amount?: string;
  tokenAmount?: { amount?: string };
}

async function parsedTransactions(
  connection: Connection,
  signatures: string[],
): Promise<Array<ParsedTransactionWithMeta | null>> {
  try {
    return await connection.getParsedTransactions(signatures, { maxSupportedTransactionVersion: 0 });
  } catch {
    // Some RPCs refuse batched requests — fall back to one at a time.
    return Promise.all(
      signatures.map((s) =>
        connection.getParsedTransaction(s, { maxSupportedTransactionVersion: 0 }).catch(() => null),
      ),
    );
  }
}

/** Forwards from `agent` to `owner`, oldest first — read straight from the
 * chain, so there's nothing to keep in sync and nothing to trust. */
export async function fetchForwards(
  connection: Connection,
  mint: PublicKey,
  agent: PublicKey,
  owner: PublicKey,
  limit = 25,
): Promise<Forward[]> {
  const agentAta = getAssociatedTokenAddressSync(mint, agent);
  const ownerAta = getAssociatedTokenAddressSync(mint, owner).toBase58();
  const sigs = (await connection.getSignaturesForAddress(agentAta, { limit })).filter((s) => s.err === null);
  if (sigs.length === 0) return [];

  const txs = await parsedTransactions(connection, sigs.map((s) => s.signature));
  const forwards: Forward[] = [];
  txs.forEach((tx, i) => {
    if (!tx) return;
    for (const ix of tx.transaction.message.instructions) {
      if (!("parsed" in ix) || ix.program !== "spl-token") continue;
      const parsed = ix.parsed as { type?: string; info?: TransferInfo };
      const info = parsed.info;
      if (
        (parsed.type === "transfer" || parsed.type === "transferChecked") &&
        info?.source === agentAta.toBase58() &&
        info.destination === ownerAta
      ) {
        forwards.push({
          signature: sigs[i].signature,
          amountTusdc: Number(info.amount ?? info.tokenAmount?.amount ?? "0") / 1_000_000,
          timeMs: (tx.blockTime ?? sigs[i].blockTime ?? 0) * 1000,
        });
      }
    }
  });
  return forwards.sort((a, b) => a.timeMs - b.timeMs);
}

/** Pairs each win with the forward that carried it: the earliest forward
 * after the entry was submitted that still has enough amount left (one sweep
 * can carry several wins). Returns win key → forward signature. */
export function matchForwards(
  wins: Array<{ key: string; afterMs: number; amountTusdc: number }>,
  forwards: Forward[],
): Map<string, string> {
  const remaining = forwards.map((f) => ({ ...f, left: f.amountTusdc }));
  const matched = new Map<string, string>();
  for (const win of [...wins].sort((a, b) => a.afterMs - b.afterMs)) {
    const f = remaining.find((r) => r.timeMs >= win.afterMs && r.left + 1e-6 >= win.amountTusdc);
    if (!f) continue;
    f.left -= win.amountTusdc;
    matched.set(win.key, f.signature);
  }
  return matched;
}
