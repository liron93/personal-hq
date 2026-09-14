
create table if not exists public.career_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  job_title text,
  years_experience integer check (years_experience is null or years_experience between 0 and 80),
  experience_areas text[] not null default '{}',
  looking_for text,
  target_companies text[] not null default '{}',
  strengths text,
  improvement_areas text,
  additional_notes text,
  setup_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.career_cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_path text unique,
  filename text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  extracted_text text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists career_cvs_one_active_per_user on public.career_cvs(user_id) where is_active;
create index if not exists career_cvs_user_created_idx on public.career_cvs(user_id, created_at desc);
create table if not exists public.career_job_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id uuid not null references public.career_jobs(id) on delete cascade,
  activity_type text not null check (activity_type in ('created','updated','status_changed','next_action_completed','note_added')),
  summary text not null,
  created_at timestamptz not null default now()
);
create index if not exists career_job_activity_job_created_idx on public.career_job_activity(job_id, created_at desc);
create table if not exists public.career_job_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id uuid not null references public.career_jobs(id) on delete cascade,
  cv_id uuid references public.career_cvs(id) on delete set null,
  storage_path text,
  file_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  document_type text not null default 'attachment' check (document_type in ('cv','cover_letter','portfolio','attachment')),
  created_at timestamptz not null default now()
);
create index if not exists career_job_documents_job_idx on public.career_job_documents(job_id, created_at desc);
alter table public.career_profiles enable row level security;
alter table public.career_cvs enable row level security;
alter table public.career_job_activity enable row level security;
alter table public.career_job_documents enable row level security;
drop policy if exists "career_profiles_owner" on public.career_profiles;
create policy "career_profiles_owner" on public.career_profiles for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "career_cvs_owner" on public.career_cvs;
create policy "career_cvs_owner" on public.career_cvs for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "career_activity_owner" on public.career_job_activity;
create policy "career_activity_owner" on public.career_job_activity for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "career_documents_owner" on public.career_job_documents;
create policy "career_documents_owner" on public.career_job_documents for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.career_profiles, public.career_cvs, public.career_job_activity, public.career_job_documents to authenticated;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('career-documents', 'career-documents', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];
drop policy if exists "career_documents_select_own" on storage.objects;
create policy "career_documents_select_own" on storage.objects for select to authenticated
using (bucket_id = 'career-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "career_documents_insert_own" on storage.objects;
create policy "career_documents_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'career-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "career_documents_update_own" on storage.objects;
create policy "career_documents_update_own" on storage.objects for update to authenticated
using (bucket_id = 'career-documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'career-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "career_documents_delete_own" on storage.objects;
create policy "career_documents_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'career-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
