begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(50);

insert into auth.users (id, aud, role, email, encrypted_password)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'user-a@example.test', 'synthetic'),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'user-b@example.test', 'synthetic');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select lives_ok(
  $$insert into public.jobs (user_id, title, company, status, discovered_on, dedupe_key)
    values ('11111111-1111-4111-8111-111111111111', 'Frontend Engineer', 'Synthetic Labs', 'saved', '2026-08-01', 'fallback:synthetic labs|frontend engineer|')$$,
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
  $$insert into public.jobs (user_id, title, company, discovered_on, dedupe_key)
    values ('22222222-2222-4222-8222-222222222222', 'Backend Engineer', 'Synthetic Works', '2026-08-02', 'fallback:synthetic works|backend engineer|')$$,
  'user B can create an owned job'
);
select is((with removed as (delete from public.jobs where user_id = '22222222-2222-4222-8222-222222222222' returning *) select count(*) from removed), 1::bigint, 'user B can delete an owned job');

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

set local role anon;
set local request.jwt.claim.sub = '';
select is((select count(*) from public.jobs), 0::bigint, 'anonymous users cannot read jobs');
select is((select count(*) from public.job_status_history), 0::bigint, 'anonymous users cannot read status history');
select is((select count(*) from public.user_filters), 0::bigint, 'anonymous users cannot read filters');
select is((select count(*) from public.knowledge_files), 0::bigint, 'anonymous users cannot read file metadata');
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
  $$insert into public.knowledge_files (user_id, object_path, original_name, mime_type, size_bytes)
    values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111/anon.txt', 'anon.txt', 'text/plain', 10)$$,
  '42501',
  null,
  'anonymous users cannot create file metadata'
);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is((with removed as (delete from public.jobs returning *) select count(*) from removed), 1::bigint, 'user A can delete the owned job');
select is((select count(*) from public.jobs), 0::bigint, 'user A has no jobs after owned delete');

select * from finish();
rollback;
