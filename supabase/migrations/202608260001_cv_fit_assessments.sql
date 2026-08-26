alter table public.generated_cvs
  add column assessment_json jsonb,
  add column assessment_provider text,
  add column assessment_model text,
  add column assessed_source_url text,
  add column assessed_at timestamptz,
  add column deleted_at timestamptz,
  add constraint generated_cvs_assessment_json_check check (
    assessment_json is null or (
      jsonb_typeof(assessment_json) = 'object'
      and octet_length(assessment_json::text) <= 20000
      and assessment_json ?& array['fitScore', 'summary', 'strengths', 'gaps']
      and jsonb_typeof(assessment_json -> 'fitScore') = 'number'
      and (assessment_json ->> 'fitScore')::numeric between 0 and 10
      and floor((assessment_json ->> 'fitScore')::numeric) = (assessment_json ->> 'fitScore')::numeric
      and jsonb_typeof(assessment_json -> 'summary') = 'string'
      and char_length(assessment_json ->> 'summary') between 1 and 1200
      and jsonb_typeof(assessment_json -> 'strengths') = 'array'
      and jsonb_array_length(assessment_json -> 'strengths') <= 5
      and jsonb_typeof(assessment_json -> 'gaps') = 'array'
      and jsonb_array_length(assessment_json -> 'gaps') <= 5
    )
  ),
  add constraint generated_cvs_assessment_metadata_check check (
    (
      assessment_json is null
      and assessment_provider is null
      and assessment_model is null
      and assessed_source_url is null
      and assessed_at is null
    ) or (
      assessment_json is not null
      and assessment_provider is not null
      and char_length(assessment_provider) between 1 and 80
      and assessment_model is not null
      and char_length(assessment_model) between 1 and 120
      and assessed_source_url is not null
      and char_length(assessed_source_url) between 8 and 2048
      and assessed_source_url ~ '^https?://'
      and assessed_at is not null
    )
  );

create index generated_cvs_active_user_job_version_idx
  on public.generated_cvs (user_id, job_id, version desc)
  where deleted_at is null;

create or replace function public.protect_generated_cv_immutable_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
    new.id,
    new.user_id,
    new.job_id,
    new.version,
    new.file_path,
    new.content_json,
    new.ai_provider,
    new.ai_model,
    new.generation_id,
    new.template_version,
    new.created_at
  ) is distinct from row(
    old.id,
    old.user_id,
    old.job_id,
    old.version,
    old.file_path,
    old.content_json,
    old.ai_provider,
    old.ai_model,
    old.generation_id,
    old.template_version,
    old.created_at
  ) then
    raise exception 'Generated CV provenance and version fields are immutable.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger generated_cvs_protect_immutable_fields
before update on public.generated_cvs
for each row execute function public.protect_generated_cv_immutable_fields();

create policy generated_cvs_update_through_job on public.generated_cvs
for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.jobs
    where jobs.id = generated_cvs.job_id
      and jobs.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.jobs
    where jobs.id = generated_cvs.job_id
      and jobs.user_id = (select auth.uid())
  )
);
