create table public.job_resume_requirements (
  job_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_json jsonb not null check (
    jsonb_typeof(analysis_json) = 'object'
    and octet_length(analysis_json::text) <= 200000
  ),
  requirements_json jsonb not null check (
    jsonb_typeof(requirements_json) = 'array'
    and octet_length(requirements_json::text) <= 100000
  ),
  updated_at timestamptz not null default now(),
  constraint job_resume_requirements_job_owner_fk
    foreign key (job_id, user_id) references public.jobs(id, user_id) on delete cascade
);

create index job_resume_requirements_user_updated_idx
  on public.job_resume_requirements (user_id, updated_at desc);

create trigger job_resume_requirements_set_updated_at
before update on public.job_resume_requirements
for each row execute function public.set_updated_at();

alter table public.job_resume_requirements enable row level security;

create policy job_resume_requirements_select_through_job on public.job_resume_requirements
for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.jobs
    where jobs.id = job_resume_requirements.job_id
      and jobs.user_id = (select auth.uid())
  )
);

create policy job_resume_requirements_insert_through_job on public.job_resume_requirements
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.jobs
    where jobs.id = job_resume_requirements.job_id
      and jobs.user_id = (select auth.uid())
  )
);

create policy job_resume_requirements_update_through_job on public.job_resume_requirements
for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.jobs
    where jobs.id = job_resume_requirements.job_id
      and jobs.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.jobs
    where jobs.id = job_resume_requirements.job_id
      and jobs.user_id = (select auth.uid())
  )
);

revoke update (job_id, user_id, updated_at) on public.job_resume_requirements from authenticated;
