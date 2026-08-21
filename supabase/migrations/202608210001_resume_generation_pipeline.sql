create type public.resume_generation_status as enum (
  'analyzing', 'awaiting_confirmation', 'generating', 'rendering', 'completed', 'failed', 'cancelled'
);

create type public.resume_confirmation_level as enum ('commercial', 'familiar', 'none');

create table public.resume_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique check (
    char_length(object_path) between 38 and 180
    and object_path like user_id::text || '/%.html'
    and object_path not like '%/../%'
  ),
  original_name text not null check (
    char_length(original_name) between 1 and 180
    and position('/' in original_name) = 0
    and position(E'\\' in original_name) = 0
    and original_name !~ '[[:cntrl:]]'
    and original_name !~ '[:*?"<>|]'
  ),
  size_bytes bigint not null check (size_bytes between 1 and 262144),
  version integer not null check (version > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, version)
);

create unique index resume_templates_one_active_uidx on public.resume_templates (user_id) where active;
create index resume_templates_user_created_idx on public.resume_templates (user_id, created_at desc);

create table public.resume_confirmations (
  user_id uuid not null references auth.users(id) on delete cascade,
  requirement_key text not null check (char_length(requirement_key) between 1 and 120),
  label text not null check (char_length(label) between 1 and 160),
  level public.resume_confirmation_level not null,
  provenance text not null check (provenance in ('existing_kb', 'explicit_user_confirmation')),
  updated_at timestamptz not null default now(),
  primary key (user_id, requirement_key)
);

create table public.resume_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null,
  status public.resume_generation_status not null default 'analyzing',
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 80),
  analysis_json jsonb check (analysis_json is null or (jsonb_typeof(analysis_json) = 'object' and octet_length(analysis_json::text) <= 200000)),
  confirmations_json jsonb not null default '[]'::jsonb check (jsonb_typeof(confirmations_json) = 'array' and octet_length(confirmations_json::text) <= 50000),
  error_code text check (error_code is null or char_length(error_code) between 1 and 120),
  template_version integer check (template_version is null or template_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resume_generations_job_owner_fk foreign key (job_id, user_id) references public.jobs(id, user_id) on delete cascade,
  unique (user_id, job_id, idempotency_key)
);

create index resume_generations_user_job_created_idx on public.resume_generations (user_id, job_id, created_at desc);

alter table public.generated_cvs
  add column generation_id uuid references public.resume_generations(id) on delete set null,
  add column template_version integer check (template_version is null or template_version > 0);

create unique index generated_cvs_generation_uidx on public.generated_cvs (generation_id) where generation_id is not null;

create trigger resume_confirmations_set_updated_at
before update on public.resume_confirmations
for each row execute function public.set_updated_at();

create trigger resume_generations_set_updated_at
before update on public.resume_generations
for each row execute function public.set_updated_at();

alter table public.resume_templates enable row level security;
alter table public.resume_confirmations enable row level security;
alter table public.resume_generations enable row level security;

create policy resume_templates_select_own on public.resume_templates
for select to authenticated using ((select auth.uid()) = user_id);
create policy resume_templates_insert_own on public.resume_templates
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy resume_templates_update_own on public.resume_templates
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy resume_confirmations_select_own on public.resume_confirmations
for select to authenticated using ((select auth.uid()) = user_id);
create policy resume_confirmations_insert_own on public.resume_confirmations
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy resume_confirmations_update_own on public.resume_confirmations
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy resume_generations_select_own on public.resume_generations
for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (select 1 from public.jobs where jobs.id = resume_generations.job_id and jobs.user_id = (select auth.uid()))
);
create policy resume_generations_insert_own on public.resume_generations
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.jobs where jobs.id = resume_generations.job_id and jobs.user_id = (select auth.uid()))
);
create policy resume_generations_update_own on public.resume_generations
for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (select 1 from public.jobs where jobs.id = resume_generations.job_id and jobs.user_id = (select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.jobs where jobs.id = resume_generations.job_id and jobs.user_id = (select auth.uid()))
);

revoke update (id, user_id, job_id, idempotency_key, created_at) on public.resume_generations from authenticated;
revoke update (id, user_id, object_path, original_name, size_bytes, version, created_at) on public.resume_templates from authenticated;
revoke update (user_id, requirement_key, updated_at) on public.resume_confirmations from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resume-templates', 'resume-templates', false, 262144, array['text/html'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy resume_template_objects_select_own on storage.objects
for select to authenticated
using (bucket_id = 'resume-templates' and (storage.foldername(name))[1] = (select auth.uid()::text) and owner_id = (select auth.uid()::text));

create policy resume_template_objects_insert_own on storage.objects
for insert to authenticated
with check (bucket_id = 'resume-templates' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy resume_template_objects_update_own on storage.objects
for update to authenticated
using (bucket_id = 'resume-templates' and (storage.foldername(name))[1] = (select auth.uid()::text) and owner_id = (select auth.uid()::text))
with check (bucket_id = 'resume-templates' and (storage.foldername(name))[1] = (select auth.uid()::text) and owner_id = (select auth.uid()::text));

create policy resume_template_objects_delete_own on storage.objects
for delete to authenticated
using (bucket_id = 'resume-templates' and (storage.foldername(name))[1] = (select auth.uid()::text) and owner_id = (select auth.uid()::text));
