alter type public.resume_generation_status add value if not exists 'strategizing';
alter type public.resume_generation_status add value if not exists 'critiquing';
alter type public.resume_generation_status add value if not exists 'correcting';
alter type public.resume_generation_status add value if not exists 'retrying';
alter type public.resume_generation_status add value if not exists 'rate_limited';
