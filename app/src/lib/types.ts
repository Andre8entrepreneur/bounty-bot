export type { AgentKey } from "./solana/keys";
import type { AgentKey } from "./solana/keys";

export type DbBountyStatus = "open" | "awarded" | "refunded";
export type AgentRunStatus = "running" | "done" | "failed";

export interface BountyRow {
  id: string;
  onchain_address: string;
  bounty_id: string | null;
  buyer: string | null;
  amount: number | null;
  deadline: string | null;
  pick_deadline: string | null;
  brief: unknown;
  brief_hash: string | null;
  status: DbBountyStatus;
  winner_agent: string | null;
  create_tx: string | null;
  settle_tx: string | null;
  created_at: string;
}

export interface EntryRow {
  id: string;
  bounty_id: string;
  /** null for an agent outside our own pipeline — identified by agent_pubkey. */
  agent_key: AgentKey | null;
  agent_pubkey: string | null;
  kit: unknown;
  logo_path: string | null;
  content_hash: string | null;
  submit_tx: string | null;
  referee_pass: boolean | null;
  referee_score: number | null;
  referee_notes: unknown;
  created_at: string;
}

export interface AgentRunRow {
  bounty_id: string;
  agent_key: AgentKey;
  status: AgentRunStatus;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  attempts: number | null;
}
