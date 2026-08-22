alter table public.resume_generations
  add column strategy_json jsonb check (strategy_json is null or octet_length(strategy_json::text) <= 200000),
  add column generation_json jsonb check (generation_json is null or octet_length(generation_json::text) <= 300000),
  add column critique_json jsonb check (critique_json is null or octet_length(critique_json::text) <= 100000),
  add column correction_json jsonb check (correction_json is null or octet_length(correction_json::text) <= 300000),
  add column current_stage text check (current_stage is null or current_stage in ('analysis', 'strategy', 'generation', 'critique', 'correction', 'render')),
  add column attempt_count integer not null default 0 check (attempt_count >= 0),
  add column next_retry_at timestamptz;

create index resume_generations_retry_idx on public.resume_generations (status, next_retry_at)
  where status in ('retrying', 'rate_limited', 'failed');
