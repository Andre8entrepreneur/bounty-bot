-- Bounty Bot — initial schema (task 2.5)
-- bounties, entries, agent_runs with RLS; a "kits" storage bucket; realtime
-- on bounties and entries.

create table public.bounties (
  id uuid primary key default gen_random_uuid(),
  onchain_address text unique not null,
  bounty_id text,
  buyer text,
  amount bigint,
  deadline timestamptz,
  pick_deadline timestamptz,
  brief jsonb,
  brief_hash text,
  status text not null default 'open' check (status in ('open', 'awarded', 'refunded')),
  winner_agent text,
  create_tx text,
  settle_tx text,
  created_at timestamptz not null default now()
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null references public.bounties (id) on delete cascade,
  agent_key text not null check (agent_key in ('minimal', 'bold', 'luxe')),
  agent_pubkey text,
  kit jsonb,
  logo_path text,
  content_hash text,
  submit_tx text,
  referee_pass boolean,
  referee_score int,
  referee_notes jsonb,
  created_at timestamptz not null default now(),
  unique (bounty_id, agent_key)
);

create table public.agent_runs (
  bounty_id uuid not null,
  agent_key text not null,
  status text not null check (status in ('running', 'done', 'failed')),
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  primary key (bounty_id, agent_key)
);

-- RLS: on for all three. anon can SELECT bounties/entries only; agent_runs
-- has no policies at all, so RLS denies every anon access. No INSERT/UPDATE/
-- DELETE policy exists anywhere, so only the service-role client (which
-- bypasses RLS) can write.
alter table public.bounties enable row level security;
alter table public.entries enable row level security;
alter table public.agent_runs enable row level security;

create policy "anon select bounties" on public.bounties
  for select to anon using (true);

create policy "anon select entries" on public.entries
  for select to anon using (true);

-- Storage: "kits" bucket, public read, service-role writes only (no write
-- policy is added, so only the service-role client can upload/delete).
insert into storage.buckets (id, name, public)
values ('kits', 'kits', true)
on conflict (id) do nothing;

create policy "public read kits bucket" on storage.objects
  for select to public using (bucket_id = 'kits');

-- Realtime on bounties and entries.
alter publication supabase_realtime add table public.bounties;
alter publication supabase_realtime add table public.entries;
