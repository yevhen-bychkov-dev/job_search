create type public.knowledge_document_kind as enum ('reference', 'candidate_profile');

alter table public.knowledge_files
  add column document_kind public.knowledge_document_kind not null default 'reference';

alter table public.knowledge_files
  drop constraint knowledge_files_mime_type_check,
  add constraint knowledge_files_mime_type_check check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json'
  )),
  add constraint knowledge_files_candidate_profile_json check (
    document_kind <> 'candidate_profile' or mime_type = 'application/json'
  );

create index knowledge_files_user_kind_created_idx
  on public.knowledge_files (user_id, document_kind, created_at desc);

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json'
]
where id = 'knowledge-base';

create unique index jobs_id_user_uidx on public.jobs (id, user_id);

create table public.generated_cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null,
  version integer not null check (version > 0),
  file_path text not null unique check (
    char_length(file_path) between 76 and 500
    and file_path like user_id::text || '/' || job_id::text || '/%.pdf'
    and file_path not like '%/../%'
  ),
  content_json jsonb not null check (
    jsonb_typeof(content_json) = 'object'
    and octet_length(content_json::text) <= 200000
  ),
  ai_provider text not null check (char_length(ai_provider) between 1 and 80),
  ai_model text not null check (char_length(ai_model) between 1 and 120),
  created_at timestamptz not null default now(),
  constraint generated_cvs_job_owner_fk
    foreign key (job_id, user_id) references public.jobs(id, user_id) on delete cascade,
  constraint generated_cvs_job_version_unique unique (job_id, version)
);

create index generated_cvs_user_job_created_idx
  on public.generated_cvs (user_id, job_id, created_at desc);

alter table public.generated_cvs enable row level security;

create policy generated_cvs_select_through_job on public.generated_cvs
for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.jobs
    where jobs.id = generated_cvs.job_id
      and jobs.user_id = (select auth.uid())
  )
);

create policy generated_cvs_insert_through_job on public.generated_cvs
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.jobs
    where jobs.id = generated_cvs.job_id
      and jobs.user_id = (select auth.uid())
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generated-cvs', 'generated-cvs', false, 2097152, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy generated_cv_objects_select_own on storage.objects
for select to authenticated
using (
  bucket_id = 'generated-cvs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and owner_id = (select auth.uid()::text)
);

create policy generated_cv_objects_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'generated-cvs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy generated_cv_objects_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'generated-cvs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and owner_id = (select auth.uid()::text)
);
