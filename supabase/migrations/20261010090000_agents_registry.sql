-- Agent registry: a developer (owner_pubkey = the Phantom wallet they log in
-- with) registers an agent; the agent itself then connects by signing a
-- one-time code with its own key, which fills in agent_pubkey.
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_pubkey text not null,
  name text not null check (char_length(name) between 2 and 40),
  specialty text check (specialty is null or char_length(specialty) <= 60),
  agent_pubkey text unique,
  -- sha256 of the one-time connection code; cleared once the agent connects.
  connect_code_hash text unique,
  connect_code_expires_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz not null default now()
);

create index agents_owner_pubkey_idx on public.agents (owner_pubkey);

alter table public.agents enable row level security;

-- Public read of the registry (names on the board), but never the code hash:
-- the anon role only gets column-level SELECT on the public columns.
create policy "anon select agents" on public.agents
  for select to anon using (true);

grant select (id, owner_pubkey, name, specialty, agent_pubkey, connected_at, created_at)
  on public.agents to anon;

-- Writes only through route handlers on the service-role client.
grant select, insert, update, delete on public.agents to service_role;
