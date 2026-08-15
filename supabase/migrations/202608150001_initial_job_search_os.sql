create extension if not exists pgcrypto with schema extensions;

create type public.job_status as enum (
  'new', 'saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'
);

create type public.work_mode as enum ('remote', 'hybrid', 'onsite', 'unspecified');

create type public.employment_type as enum (
  'full_time', 'part_time', 'contract', 'internship', 'temporary', 'unspecified'
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 200),
  company text not null check (char_length(company) between 2 and 200),
  status public.job_status not null default 'new',
  source text not null default '' check (char_length(source) <= 120),
  source_url text not null default '' check (char_length(source_url) <= 2048),
  location text not null default '' check (char_length(location) <= 200),
  work_mode public.work_mode not null default 'unspecified',
  employment_type public.employment_type not null default 'unspecified',
  salary text not null default '' check (char_length(salary) <= 200),
  description text not null default '' check (char_length(description) <= 30000),
  technologies text[] not null default '{}'::text[] check (cardinality(technologies) <= 50),
  notes text not null default '' check (char_length(notes) <= 20000),
  discovered_on date not null,
  applied_on date,
  dedupe_key text not null check (char_length(dedupe_key) between 10 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applied_date_not_before_discovery check (
    applied_on is null or applied_on >= discovered_on
  )
);

create unique index jobs_user_dedupe_key_uidx on public.jobs (user_id, dedupe_key);
create index jobs_user_created_idx on public.jobs (user_id, created_at desc);
create index jobs_user_status_idx on public.jobs (user_id, status);
create index jobs_user_applied_idx on public.jobs (user_id, applied_on) where applied_on is not null;

create table public.job_status_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  from_status public.job_status,
  to_status public.job_status not null,
  changed_at timestamptz not null default now(),
  constraint status_must_change check (from_status is null or from_status <> to_status)
);

create index job_status_history_job_changed_idx
  on public.job_status_history (job_id, changed_at desc);
create index job_status_history_to_status_idx
  on public.job_status_history (to_status, changed_at desc);

create table public.user_filters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  included_technologies text[] not null default array['React', 'TypeScript', 'JavaScript', 'Next.js', 'Node.js'],
  excluded_technologies text[] not null default '{}'::text[],
  preferred_titles text[] not null default '{}'::text[],
  updated_at timestamptz not null default now(),
  constraint included_technologies_limit check (cardinality(included_technologies) <= 50),
  constraint excluded_technologies_limit check (cardinality(excluded_technologies) <= 50),
  constraint preferred_titles_limit check (cardinality(preferred_titles) <= 50)
);

create table public.knowledge_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique check (char_length(object_path) between 38 and 500),
  original_name text not null check (char_length(original_name) between 1 and 180),
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/csv'
  )),
  size_bytes bigint not null check (size_bytes between 1 and 4194304),
  created_at timestamptz not null default now()
);

create index knowledge_files_user_created_idx on public.knowledge_files (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

create trigger user_filters_set_updated_at
before update on public.user_filters
for each row execute function public.set_updated_at();

create or replace function public.record_job_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.job_status_history (job_id, from_status, to_status)
    values (new.id, null, new.status);
  elsif old.status is distinct from new.status then
    insert into public.job_status_history (job_id, from_status, to_status)
    values (new.id, old.status, new.status);
  end if;
  return new;
end;
$$;

revoke all on function public.record_job_status_change() from public;

create trigger jobs_record_status_change
after insert or update of status on public.jobs
for each row execute function public.record_job_status_change();

alter table public.jobs enable row level security;
alter table public.job_status_history enable row level security;
alter table public.user_filters enable row level security;
alter table public.knowledge_files enable row level security;

create policy jobs_select_own on public.jobs
for select to authenticated
using ((select auth.uid()) = user_id);

create policy jobs_insert_own on public.jobs
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy jobs_update_own on public.jobs
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy jobs_delete_own on public.jobs
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy job_status_history_select_through_job on public.job_status_history
for select to authenticated
using (
  exists (
    select 1 from public.jobs
    where jobs.id = job_status_history.job_id
      and jobs.user_id = (select auth.uid())
  )
);

create policy user_filters_select_own on public.user_filters
for select to authenticated
using ((select auth.uid()) = user_id);

create policy user_filters_insert_own on public.user_filters
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy user_filters_update_own on public.user_filters
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy user_filters_delete_own on public.user_filters
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy knowledge_files_select_own on public.knowledge_files
for select to authenticated
using ((select auth.uid()) = user_id);

create policy knowledge_files_insert_own on public.knowledge_files
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy knowledge_files_update_own on public.knowledge_files
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy knowledge_files_delete_own on public.knowledge_files
for delete to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge-base',
  'knowledge-base',
  false,
  4194304,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/csv'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy knowledge_objects_select_own on storage.objects
for select to authenticated
using (
  bucket_id = 'knowledge-base'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and owner_id = (select auth.uid()::text)
);

create policy knowledge_objects_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'knowledge-base'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy knowledge_objects_update_own on storage.objects
for update to authenticated
using (
  bucket_id = 'knowledge-base'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'knowledge-base'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and owner_id = (select auth.uid()::text)
);

create policy knowledge_objects_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'knowledge-base'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and owner_id = (select auth.uid()::text)
);
