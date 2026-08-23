alter table public.job_resume_requirements
  add column approved_at timestamptz;

-- Existing saved choices were explicitly saved by the owner. Preserve that
-- approval while the application still requires every unconfirmed item to be
-- resolved before a new generation can start.
update public.job_resume_requirements
set approved_at = updated_at
where approved_at is null;

alter table public.resume_generations
  add column lease_expires_at timestamptz,
  add column ai_provider text check (ai_provider is null or char_length(ai_provider) between 1 and 80),
  add column ai_model text check (ai_model is null or char_length(ai_model) between 1 and 120);

-- Preserve the most complete content produced by the previous critique flow.
update public.resume_generations
set generation_json = correction_json
where correction_json is not null;

-- A previous interrupted request could leave more than one active row. Keep
-- the newest row resumable and retire older duplicates before enforcing the
-- invariant at the database boundary.
with ranked as (
  select
    id,
    row_number() over (partition by user_id, job_id order by updated_at desc, id desc) as position
  from public.resume_generations
  where status in (
    'analyzing', 'awaiting_confirmation', 'strategizing', 'generating',
    'critiquing', 'correcting', 'rendering', 'retrying'
  )
)
update public.resume_generations as generation
set
  status = 'cancelled',
  lease_expires_at = null,
  error_code = 'SUPERSEDED_ACTIVE_GENERATION'
from ranked
where generation.id = ranked.id
  and ranked.position > 1;

create unique index resume_generations_one_active_per_job_uidx
  on public.resume_generations (user_id, job_id)
  where status in (
    'analyzing', 'awaiting_confirmation', 'strategizing', 'generating',
    'critiquing', 'correcting', 'rendering', 'retrying'
  );

create index resume_generations_lease_idx
  on public.resume_generations (lease_expires_at)
  where lease_expires_at is not null;
