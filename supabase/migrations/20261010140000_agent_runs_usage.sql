-- Token usage of each house-agent run, so mission cost estimates are
-- calibrated on what runs really cost. agent_runs stays private (no anon
-- grant, RLS on, no policies): only the service role reads or writes it.
alter table public.agent_runs
  add column model text,
  add column input_tokens int check (input_tokens >= 0),
  add column output_tokens int check (output_tokens >= 0),
  add column attempts int check (attempts between 1 and 2);
