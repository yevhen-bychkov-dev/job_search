alter table public.jobs
  add constraint jobs_source_url_http_only check (
    source_url = ''
    or source_url ~* '^https?://[^[:space:]]+$'
  ),
  add constraint jobs_technologies_bounded check (
    array_position(technologies, null) is null
    and char_length(array_to_string(technologies, E'\n')) <= 3000
  );

alter table public.user_filters
  add constraint user_filters_included_bounded check (
    array_position(included_technologies, null) is null
    and char_length(array_to_string(included_technologies, E'\n')) <= 4000
  ),
  add constraint user_filters_excluded_bounded check (
    array_position(excluded_technologies, null) is null
    and char_length(array_to_string(excluded_technologies, E'\n')) <= 4000
  ),
  add constraint user_filters_titles_bounded check (
    array_position(preferred_titles, null) is null
    and char_length(array_to_string(preferred_titles, E'\n')) <= 4000
  );

alter table public.knowledge_files
  add constraint knowledge_files_object_path_owned check (
    object_path like user_id::text || '/%'
    and object_path not like '%/../%'
    and object_path not like '%/..'
  ),
  add constraint knowledge_files_original_name_safe check (
    position('/' in original_name) = 0
    and position(E'\\' in original_name) = 0
    and original_name !~ '[[:cntrl:]]'
    and original_name !~ '[:*?"<>|]'
  );

drop policy if exists knowledge_files_update_own on public.knowledge_files;
