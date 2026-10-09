-- service_role bypasses RLS, but (like anon) it still needs an explicit
-- table-level GRANT before Postgres lets it touch these tables at all. Route
-- handlers write through this role, so it needs full read/write here.
grant select, insert, update, delete on public.bounties to service_role;
grant select, insert, update, delete on public.entries to service_role;
grant select, insert, update, delete on public.agent_runs to service_role;
