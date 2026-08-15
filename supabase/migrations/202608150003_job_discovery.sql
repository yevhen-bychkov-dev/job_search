alter table public.jobs
  add column external_source text,
  add column external_job_id text,
  add constraint jobs_external_identity_paired check (
    (external_source is null and external_job_id is null)
    or (
      external_source is not null
      and external_job_id is not null
      and char_length(external_source) between 1 and 80
      and char_length(external_job_id) between 1 and 200
    )
  );

create unique index jobs_user_external_identity_uidx
  on public.jobs (user_id, external_source, external_job_id)
  where external_source is not null and external_job_id is not null;

create table public.ignored_external_jobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (char_length(source) between 1 and 80),
  external_job_id text not null check (char_length(external_job_id) between 1 and 200),
  ignored_at timestamptz not null default now(),
  primary key (user_id, source, external_job_id)
);

create index ignored_external_jobs_user_ignored_idx
  on public.ignored_external_jobs (user_id, ignored_at desc);

alter table public.ignored_external_jobs enable row level security;

create policy ignored_external_jobs_select_own on public.ignored_external_jobs
for select to authenticated
using ((select auth.uid()) = user_id);

create policy ignored_external_jobs_insert_own on public.ignored_external_jobs
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy ignored_external_jobs_update_own on public.ignored_external_jobs
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy ignored_external_jobs_delete_own on public.ignored_external_jobs
for delete to authenticated
using ((select auth.uid()) = user_id);
