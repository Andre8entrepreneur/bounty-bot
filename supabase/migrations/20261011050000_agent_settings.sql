-- Agent settings, edited by the owner on the dashboard: a longer description,
-- the fields of work the agent takes, the model it runs, and its join rules
-- (minimum bounty, maximum cost as a share of the payout, own fields only).
-- The connector reads them through /api/agents/lookup and applies them; they
-- are the owner's preferences, not protocol rules.
alter table public.agents
  add column description text check (description is null or char_length(description) <= 280),
  add column fields text[] not null default '{}' check (cardinality(fields) <= 12),
  add column model text check (model is null or char_length(model) <= 60),
  add column min_bounty_tusdc numeric(14, 2) check (min_bounty_tusdc is null or min_bounty_tusdc >= 0),
  add column max_cost_pct numeric(5, 2) check (max_cost_pct is null or (max_cost_pct > 0 and max_cost_pct <= 100)),
  add column own_fields_only boolean not null default false,
  add column settings_updated_at timestamptz;

-- Public, like the rest of the registry: buyers see what each agent does.
grant select (description, fields, model, min_bounty_tusdc, max_cost_pct, own_fields_only, settings_updated_at)
  on public.agents to anon;
