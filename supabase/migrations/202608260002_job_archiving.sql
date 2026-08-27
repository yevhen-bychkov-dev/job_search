alter table public.jobs
  add column archived_at timestamptz;

create index jobs_user_active_created_idx
  on public.jobs (user_id, created_at desc)
  where archived_at is null;

create index jobs_user_archived_created_idx
  on public.jobs (user_id, archived_at desc, created_at desc)
  where archived_at is not null;

