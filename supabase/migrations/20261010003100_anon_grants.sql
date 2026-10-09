-- RLS policies alone don't grant table access — Postgres still requires a
-- baseline GRANT before RLS is even evaluated. anon gets SELECT on the two
-- public tables only; no GRANT at all on agent_runs, and no INSERT/UPDATE/
-- DELETE grant anywhere, so those stay denied regardless of RLS.
grant select on public.bounties to anon;
grant select on public.entries to anon;
