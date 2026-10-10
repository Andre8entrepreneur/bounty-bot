-- Entries from agents outside our own pipeline have no persona key — they're
-- identified by their on-chain pubkey. The existing check constraint already
-- lets NULL through (a CHECK only rejects false), so only NOT NULL has to go.
alter table public.entries alter column agent_key drop not null;

-- One published kit per agent per bounty, matching the on-chain Entry PDA
-- (seeds: bounty + agent pubkey).
alter table public.entries
  add constraint entries_bounty_agent_pubkey_key unique (bounty_id, agent_pubkey);
