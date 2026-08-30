create table public.generated_cover_letters (
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
    and content_json ?& array['salutation', 'paragraphs', 'signOff']
    and content_json - array['salutation', 'paragraphs', 'signOff'] = '{}'::jsonb
    and jsonb_typeof(content_json -> 'salutation') = 'string'
    and char_length(content_json ->> 'salutation') between 1 and 160
    and jsonb_typeof(content_json -> 'paragraphs') = 'array'
    and jsonb_array_length(content_json -> 'paragraphs') between 3 and 5
    and jsonb_typeof(content_json -> 'signOff') = 'string'
    and char_length(content_json ->> 'signOff') between 1 and 100
    and octet_length(content_json::text) <= 200000
  ),
  ai_provider text not null check (char_length(ai_provider) between 1 and 80),
  ai_model text not null check (char_length(ai_model) between 1 and 120),
  request_id uuid not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint generated_cover_letters_job_owner_fk
    foreign key (job_id, user_id) references public.jobs(id, user_id) on delete cascade,
  constraint generated_cover_letters_job_version_unique unique (job_id, version),
  constraint generated_cover_letters_request_unique unique (user_id, job_id, request_id)
);

create index generated_cover_letters_user_job_created_idx
  on public.generated_cover_letters (user_id, job_id, created_at desc);

create function public.guard_generated_cover_letter_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.job_id is distinct from old.job_id
    or new.version is distinct from old.version
    or new.file_path is distinct from old.file_path
    or new.content_json is distinct from old.content_json
    or new.ai_provider is distinct from old.ai_provider
    or new.ai_model is distinct from old.ai_model
    or new.request_id is distinct from old.request_id
    or new.created_at is distinct from old.created_at then
    raise exception 'generated cover-letter provenance is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger generated_cover_letters_guard_update
before update on public.generated_cover_letters
for each row execute function public.guard_generated_cover_letter_update();

alter table public.generated_cover_letters enable row level security;

create policy generated_cover_letters_select_through_job on public.generated_cover_letters
for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.jobs
    where jobs.id = generated_cover_letters.job_id
      and jobs.user_id = (select auth.uid())
  )
);

create policy generated_cover_letters_insert_through_job on public.generated_cover_letters
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.jobs
    where jobs.id = generated_cover_letters.job_id
      and jobs.user_id = (select auth.uid())
  )
);

create policy generated_cover_letters_update_through_job on public.generated_cover_letters
for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.jobs
    where jobs.id = generated_cover_letters.job_id
      and jobs.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.jobs
    where jobs.id = generated_cover_letters.job_id
      and jobs.user_id = (select auth.uid())
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generated-cover-letters', 'generated-cover-letters', false, 2097152, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy generated_cover_letter_objects_select_own on storage.objects
for select to authenticated
using (
  bucket_id = 'generated-cover-letters'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and owner_id = (select auth.uid()::text)
);

create policy generated_cover_letter_objects_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'generated-cover-letters'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy generated_cover_letter_objects_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'generated-cover-letters'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and owner_id = (select auth.uid()::text)
);

notify pgrst, 'reload schema';
