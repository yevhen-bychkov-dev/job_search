begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(101);

insert into auth.users (id, aud, role, email, encrypted_password)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'user-a@example.test', 'synthetic'),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'user-b@example.test', 'synthetic');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select lives_ok(
  $$insert into public.jobs (id, user_id, title, company, status, discovered_on, dedupe_key)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Frontend Engineer', 'Synthetic Labs', 'saved', '2026-08-01', 'fallback:synthetic labs|frontend engineer|')$$,
  'user A can create an owned job'
);
select is((select count(*) from public.jobs), 1::bigint, 'user A can read the owned job');
select is((select count(*) from public.job_status_history), 1::bigint, 'insert trigger records initial status');
select is((with changed as (update public.jobs set title = 'Senior Frontend Engineer' returning *) select count(*) from changed), 1::bigint, 'user A can update the owned job');
select is((with changed as (update public.jobs set status = 'interview' returning *) select count(*) from changed), 1::bigint, 'user A can change status');
select is((select count(*) from public.job_status_history), 2::bigint, 'status change trigger records history');
select throws_ok(
  $$insert into public.jobs (user_id, title, company, discovered_on, dedupe_key)
    values ('11111111-1111-4111-8111-111111111111', 'x', 'Synthetic Labs', '2026-08-01', 'fallback:invalid-title')$$,
  '23514',
  null,
  'database constraint rejects an invalid title'
);
select throws_ok(
  $$insert into public.jobs (user_id, title, company, source_url, discovered_on, dedupe_key)
    values ('11111111-1111-4111-8111-111111111111', 'Unsafe Link', 'Synthetic Labs', 'javascript:alert(1)', '2026-08-01', 'fallback:unsafe-link')$$,
  '23514',
  null,
  'database constraint rejects a non-http source URL'
);
select throws_ok(
  $$update public.jobs set user_id = '22222222-2222-4222-8222-222222222222'
    where user_id = '11111111-1111-4111-8111-111111111111'$$,
  '42501',
  null,
  'user A cannot reassign an owned job to user B'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select is((select count(*) from public.jobs), 0::bigint, 'user B cannot read user A job');
select throws_ok(
  $$insert into public.jobs (user_id, title, company, discovered_on, dedupe_key)
    values ('11111111-1111-4111-8111-111111111111', 'Unauthorized Job', 'Synthetic Labs', '2026-08-01', 'fallback:unauthorized')$$,
  '42501',
  null,
  'user B cannot create a job for user A'
);
select is((with changed as (update public.jobs set title = 'Stolen' where user_id = '11111111-1111-4111-8111-111111111111' returning *) select count(*) from changed), 0::bigint, 'user B cannot update user A job');
select is((with removed as (delete from public.jobs where user_id = '11111111-1111-4111-8111-111111111111' returning *) select count(*) from removed), 0::bigint, 'user B cannot delete user A job');
select is((select count(*) from public.job_status_history), 0::bigint, 'user B cannot read user A status history');

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is((select count(*) from public.jobs where title = 'Senior Frontend Engineer'), 1::bigint, 'user A job remains unchanged after user B attempts');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select lives_ok(
  $$insert into public.jobs (id, user_id, title, company, discovered_on, dedupe_key)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Backend Engineer', 'Synthetic Works', '2026-08-02', 'fallback:synthetic works|backend engineer|')$$,
  'user B can create an owned job'
);
select lives_ok(
  $$insert into public.generated_cvs (id, user_id, job_id, version, file_path, content_json, ai_provider, ai_model)
    values (
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '22222222-2222-4222-8222-222222222222',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      1,
      '22222222-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.pdf',
      '{"headline": null}'::jsonb,
      'gemini',
      'gemini-test'
    )$$,
  'user B can create an immutable CV version for an owned job'
);
select is((select count(*) from public.generated_cvs), 1::bigint, 'user B can read the owned CV version');
select is(
  (with changed as (update public.generated_cvs set ai_model = 'changed' returning *) select count(*) from changed),
  0::bigint,
  'generated CV versions cannot be updated directly'
);
select throws_ok(
  $$insert into public.generated_cvs (user_id, job_id, version, file_path, content_json, ai_provider, ai_model)
    values (
      '22222222-2222-4222-8222-222222222222',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      1,
      '22222222-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf',
      '{}'::jsonb,
      'gemini',
      'gemini-test'
    )$$,
  '23505',
  null,
  'database rejects duplicate per-job CV versions'
);
select throws_ok(
  $$insert into public.generated_cvs (user_id, job_id, version, file_path, content_json, ai_provider, ai_model)
    values (
      '22222222-2222-4222-8222-222222222222',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      2,
      '11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf',
      '{}'::jsonb,
      'gemini',
      'gemini-test'
    )$$,
  '23514',
  null,
  'generated CV file paths must match their owner and job'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is((select count(*) from public.generated_cvs), 0::bigint, 'user A cannot read user B CV versions');
select throws_ok(
  $$insert into public.generated_cvs (user_id, job_id, version, file_path, content_json, ai_provider, ai_model)
    values (
      '22222222-2222-4222-8222-222222222222',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      2,
      '22222222-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf',
      '{}'::jsonb,
      'gemini',
      'gemini-test'
    )$$,
  '42501',
  null,
  'user A cannot create a CV version for user B job'
);
select is((with changed as (update public.generated_cvs set ai_model = 'stolen' returning *) select count(*) from changed), 0::bigint, 'user A cannot update user B CV versions');
select is((with removed as (delete from public.generated_cvs returning *) select count(*) from removed), 0::bigint, 'user A cannot delete user B CV versions');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is((with removed as (delete from public.jobs where user_id = '22222222-2222-4222-8222-222222222222' returning *) select count(*) from removed), 1::bigint, 'user B can delete an owned job');
select is((select count(*) from public.generated_cvs), 0::bigint, 'deleting an owned job cascades its CV metadata');

select lives_ok(
  $$insert into public.user_filters (user_id) values ('22222222-2222-4222-8222-222222222222')$$,
  'user B can create owned filters'
);
select is((select count(*) from public.user_filters), 1::bigint, 'user B can read owned filters');
select is((with changed as (update public.user_filters set preferred_titles = array['Frontend'] returning *) select count(*) from changed), 1::bigint, 'user B can update owned filters');
select is((select preferred_titles[1] from public.user_filters), 'Frontend', 'updated filters persist');

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is((select count(*) from public.user_filters), 0::bigint, 'user A cannot read user B filters');
select throws_ok(
  $$insert into public.user_filters (user_id) values ('22222222-2222-4222-8222-222222222222')$$,
  '42501',
  null,
  'user A cannot create filters for user B'
);
select is((with changed as (update public.user_filters set preferred_titles = array['Stolen'] returning *) select count(*) from changed), 0::bigint, 'user A cannot update user B filters');
select is((with removed as (delete from public.user_filters returning *) select count(*) from removed), 0::bigint, 'user A cannot delete user B filters');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select lives_ok(
  $$insert into public.knowledge_files (user_id, object_path, original_name, mime_type, size_bytes)
    values ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222/file.txt', 'file.txt', 'text/plain', 10)$$,
  'user B can create owned file metadata'
);
select is((select count(*) from public.knowledge_files), 1::bigint, 'user B can read owned file metadata');
select is(
  (with changed as (update public.knowledge_files set original_name = 'changed.txt' returning *) select count(*) from changed),
  0::bigint,
  'file metadata cannot be updated directly'
);
select throws_ok(
  $$insert into public.knowledge_files (user_id, object_path, original_name, mime_type, size_bytes)
    values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111/wrong.txt', 'wrong.txt', 'text/plain', 10)$$,
  '23514',
  null,
  'file metadata path must begin with its owner UUID'
);
select throws_ok(
  $$insert into public.knowledge_files (user_id, object_path, original_name, mime_type, size_bytes)
    values ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222/unsafe.txt', '../unsafe.txt', 'text/plain', 10)$$,
  '23514',
  null,
  'file metadata rejects unsafe original names'
);
select throws_ok(
  $$insert into public.knowledge_files (user_id, object_path, original_name, mime_type, document_kind, size_bytes)
    values ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222/profile.txt', 'profile.txt', 'text/plain', 'candidate_profile', 10)$$,
  '23514',
  null,
  'candidate profile knowledge files must use JSON'
);
select throws_ok(
  $$insert into public.knowledge_files (user_id, object_path, original_name, mime_type, document_kind, size_bytes)
    values ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222/other.json', 'other.json', 'application/json', 'unsupported', 10)$$,
  '22P02',
  null,
  'knowledge files reject unsupported document kinds'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is((select count(*) from public.knowledge_files), 0::bigint, 'user A cannot read user B file metadata');
select throws_ok(
  $$insert into public.knowledge_files (user_id, object_path, original_name, mime_type, size_bytes)
    values ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222/stolen.txt', 'stolen.txt', 'text/plain', 10)$$,
  '42501',
  null,
  'user A cannot create file metadata for user B'
);
select is((with changed as (update public.knowledge_files set original_name = 'stolen.txt' returning *) select count(*) from changed), 0::bigint, 'user A cannot update user B file metadata');
select is((with removed as (delete from public.knowledge_files returning *) select count(*) from removed), 0::bigint, 'user A cannot delete user B file metadata');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is((with removed as (delete from public.knowledge_files returning *) select count(*) from removed), 1::bigint, 'user B can delete owned file metadata');

reset role;
select is((select count(*) from storage.buckets where id = 'knowledge-base' and public = false), 1::bigint, 'private knowledge-base bucket exists');
select is((select count(*) from storage.buckets where id = 'generated-cvs' and public = false), 1::bigint, 'private generated-cvs bucket exists');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'knowledge_objects_%'), 4::bigint, 'Storage has select, insert, update, and delete ownership policies');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'knowledge_files' and cmd = 'UPDATE'), 0::bigint, 'file metadata has no direct update policy');
select like(
  (select qual from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'knowledge_objects_select_own'),
  '%owner_id%auth.uid%',
  'Storage select policy verifies object ownership'
);
select like(
  (select with_check from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'knowledge_objects_insert_own'),
  '%foldername%auth.uid%',
  'Storage insert policy verifies the authenticated path prefix'
);
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'job_status_history' and cmd <> 'SELECT'), 0::bigint, 'status history cannot be directly mutated through RLS');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'generated_cv_objects_%'), 3::bigint, 'generated CV Storage has select, insert, and compensation delete policies');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'generated_cvs' and cmd = 'UPDATE'), 0::bigint, 'generated CV metadata has no update policy');
select like(
  (select qual from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'generated_cv_objects_select_own'),
  '%owner_id%auth.uid%',
  'generated CV Storage select policy verifies object ownership'
);
select like(
  (select with_check from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'generated_cv_objects_insert_own'),
  '%foldername%auth.uid%',
  'generated CV Storage insert policy verifies the authenticated path prefix'
);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select lives_ok(
  $$insert into public.jobs (user_id, title, company, source, source_url, external_source, external_job_id, discovered_on, dedupe_key)
    values ('11111111-1111-4111-8111-111111111111', 'Discovered Engineer', 'Synthetic Discovery', 'JustJoinIT', 'https://justjoin.it/job-offer/synthetic', 'justjoinit', 'external-1', '2026-08-15', 'external:justjoinit:external-1')$$,
  'user A can create a discovered job with a stable external identity'
);
select throws_ok(
  $$insert into public.jobs (user_id, title, company, external_source, external_job_id, discovered_on, dedupe_key)
    values ('11111111-1111-4111-8111-111111111111', 'Duplicate External', 'Synthetic Discovery', 'justjoinit', 'external-1', '2026-08-15', 'fallback:different-key')$$,
  '23505',
  null,
  'database rejects a duplicate source and external job identity'
);
select is((select count(*) from public.jobs where external_source = 'justjoinit'), 1::bigint, 'user A sees one discovered job identity');
select lives_ok(
  $$insert into public.ignored_external_jobs (user_id, source, external_job_id)
    values ('11111111-1111-4111-8111-111111111111', 'justjoinit', 'ignored-1')$$,
  'user A can ignore an external job'
);
select is((select count(*) from public.ignored_external_jobs), 1::bigint, 'user A can read the owned ignored identity');
select is((with changed as (update public.ignored_external_jobs set ignored_at = now() returning *) select count(*) from changed), 1::bigint, 'user A can update the owned ignored identity');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is((select count(*) from public.ignored_external_jobs), 0::bigint, 'user B cannot read user A ignored identities');
select throws_ok(
  $$insert into public.ignored_external_jobs (user_id, source, external_job_id)
    values ('11111111-1111-4111-8111-111111111111', 'justjoinit', 'stolen-ignore')$$,
  '42501',
  null,
  'user B cannot create an ignored identity for user A'
);
select is((with changed as (update public.ignored_external_jobs set source = 'other' returning *) select count(*) from changed), 0::bigint, 'user B cannot update user A ignored identities');
select is((with removed as (delete from public.ignored_external_jobs returning *) select count(*) from removed), 0::bigint, 'user B cannot delete user A ignored identities');

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select throws_ok(
  $$update public.ignored_external_jobs set user_id = '22222222-2222-4222-8222-222222222222'$$,
  '42501',
  null,
  'user A cannot reassign an ignored identity to user B'
);
select is((with removed as (delete from public.ignored_external_jobs returning *) select count(*) from removed), 1::bigint, 'user A can delete the owned ignored identity');

select lives_ok(
  $$insert into public.resume_templates (id, user_id, object_path, original_name, size_bytes, version, active)
    values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.html', 'resume.html', 1200, 1, true)$$,
  'user A can create an owned resume template'
);
select is((select count(*) from public.resume_templates), 1::bigint, 'user A can read the active resume template');
select lives_ok(
  $$insert into public.resume_confirmations (user_id, requirement_key, label, level, provenance)
    values ('11111111-1111-4111-8111-111111111111', 'graphql', 'GraphQL', 'familiar', 'explicit_user_confirmation')$$,
  'user A can save an explicit resume confirmation'
);
select is((select count(*) from public.resume_confirmations), 1::bigint, 'user A can read resume confirmations');
select lives_ok(
  $$insert into public.job_resume_requirements (job_id, user_id, analysis_json, requirements_json)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '{"mustHaveTechnical":[]}'::jsonb, '[{"key":"graphql","label":"GraphQL","level":"commercial"}]'::jsonb)$$,
  'user A can save requirements for an owned job'
);
select is((select count(*) from public.job_resume_requirements), 1::bigint, 'user A can read job requirements');
select is((with changed as (update public.job_resume_requirements set requirements_json = '[]'::jsonb returning *) select count(*) from changed), 1::bigint, 'user A can edit owned job requirements');
select lives_ok(
  $$insert into public.resume_generations (id, user_id, job_id, status, idempotency_key, analysis_json, confirmations_json, template_version)
    values ('ffffffff-ffff-4fff-8fff-ffffffffffff', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'analyzing', 'synthetic-idempotency-1', '{}'::jsonb, '[]'::jsonb, 1)$$,
  'user A can create an owned resume generation'
);
select is((select count(*) from public.resume_generations), 1::bigint, 'user A can read resume generation state');
select is((with changed as (update public.resume_generations set status = 'awaiting_confirmation' returning *) select count(*) from changed), 1::bigint, 'user A can advance owned resume generation state');
select is((with changed as (update public.resume_generations set status = 'strategizing', current_stage = 'strategy', strategy_json = '{"targetPositioning":"Product Engineer"}'::jsonb, attempt_count = 1 returning *) select count(*) from changed), 1::bigint, 'user A can persist a resumable resume strategy stage');
select is((select strategy_json->>'targetPositioning' from public.resume_generations where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'), 'Product Engineer', 'resume strategy artifact is persisted');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is((select count(*) from public.resume_templates), 0::bigint, 'user B cannot read user A templates');
select is((select count(*) from public.resume_confirmations), 0::bigint, 'user B cannot read user A confirmations');
select is((select count(*) from public.job_resume_requirements), 0::bigint, 'user B cannot read user A job requirements');
select is((select count(*) from public.resume_generations), 0::bigint, 'user B cannot read user A generation state');
select throws_ok(
  $$insert into public.resume_templates (user_id, object_path, original_name, size_bytes, version, active)
    values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111/stolen.html', 'stolen.html', 100, 2, true)$$,
  '42501', null, 'user B cannot create a template for user A'
);
select throws_ok(
  $$insert into public.resume_generations (user_id, job_id, idempotency_key)
    values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'stolen-generation-key')$$,
  '42501', null, 'user B cannot create a generation for user A'
);
select throws_ok(
  $$insert into public.job_resume_requirements (job_id, user_id, analysis_json, requirements_json)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '{}'::jsonb, '[]'::jsonb)$$,
  '42501', null, 'user B cannot create job requirements for user A'
);

set local role anon;
set local request.jwt.claim.sub = '';
select is((select count(*) from public.jobs), 0::bigint, 'anonymous users cannot read jobs');
select is((select count(*) from public.job_status_history), 0::bigint, 'anonymous users cannot read status history');
select is((select count(*) from public.user_filters), 0::bigint, 'anonymous users cannot read filters');
select is((select count(*) from public.knowledge_files), 0::bigint, 'anonymous users cannot read file metadata');
select is((select count(*) from public.ignored_external_jobs), 0::bigint, 'anonymous users cannot read ignored identities');
select is((select count(*) from public.generated_cvs), 0::bigint, 'anonymous users cannot read generated CVs');
select is((select count(*) from public.resume_templates), 0::bigint, 'anonymous users cannot read resume templates');
select is((select count(*) from public.resume_confirmations), 0::bigint, 'anonymous users cannot read resume confirmations');
select is((select count(*) from public.job_resume_requirements), 0::bigint, 'anonymous users cannot read job requirements');
select is((select count(*) from public.resume_generations), 0::bigint, 'anonymous users cannot read resume generations');
select throws_ok(
  $$insert into public.jobs (user_id, title, company, discovered_on, dedupe_key)
    values ('11111111-1111-4111-8111-111111111111', 'Anonymous Job', 'Synthetic Labs', '2026-08-01', 'fallback:anonymous')$$,
  '42501',
  null,
  'anonymous users cannot create jobs'
);
select throws_ok(
  $$insert into public.user_filters (user_id) values ('11111111-1111-4111-8111-111111111111')$$,
  '42501',
  null,
  'anonymous users cannot create filter settings'
);
select throws_ok(
  $$insert into public.ignored_external_jobs (user_id, source, external_job_id)
    values ('11111111-1111-4111-8111-111111111111', 'justjoinit', 'anonymous-ignore')$$,
  '42501',
  null,
  'anonymous users cannot create ignored identities'
);
select throws_ok(
  $$insert into public.job_resume_requirements (job_id, user_id, analysis_json, requirements_json)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '{}'::jsonb, '[]'::jsonb)$$,
  '42501',
  null,
  'anonymous users cannot create job requirements'
);
select throws_ok(
  $$insert into public.knowledge_files (user_id, object_path, original_name, mime_type, size_bytes)
    values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111/anon.txt', 'anon.txt', 'text/plain', 10)$$,
  '42501',
  null,
  'anonymous users cannot create file metadata'
);
select throws_ok(
  $$insert into public.generated_cvs (user_id, job_id, version, file_path, content_json, ai_provider, ai_model)
    values (
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      1,
      '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.pdf',
      '{}'::jsonb,
      'gemini',
      'gemini-test'
    )$$,
  '42501',
  null,
  'anonymous users cannot create generated CV metadata'
);
select throws_ok(
  $$insert into public.resume_templates (user_id, object_path, original_name, size_bytes, version, active)
    values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111/anonymous.html', 'anonymous.html', 100, 2, true)$$,
  '42501', null, 'anonymous users cannot create resume templates'
);
select throws_ok(
  $$insert into public.resume_confirmations (user_id, requirement_key, label, level, provenance)
    values ('11111111-1111-4111-8111-111111111111', 'anonymous', 'Anonymous', 'none', 'explicit_user_confirmation')$$,
  '42501', null, 'anonymous users cannot create resume confirmations'
);
select throws_ok(
  $$insert into public.resume_generations (user_id, job_id, idempotency_key)
    values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'anonymous-generation-key')$$,
  '42501', null, 'anonymous users cannot create resume generations'
);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is((with removed as (delete from public.jobs returning *) select count(*) from removed), 2::bigint, 'user A can delete the owned jobs');
select is((select count(*) from public.jobs), 0::bigint, 'user A has no jobs after owned delete');

select * from finish();
rollback;
