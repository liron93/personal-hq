-- בסיס סינתטי לבדיקה בלבד (staging ריק). אין כאן שום נתון אמיתי ואין העתקה מ-production.
-- career_jobs ו-career_communications אינן בשום migration בריפו (הקוד משתמש בהן). כאן הן stand-in עם אותו דפוס owner-only.
-- הטבלאות האמיתיות ב-production עשויות להיות שונות: ה-RLS האמיתי שלהן נבדק בנפרד ב-030_career_policy_qual_check.sql.
-- סדר הרצה: schema.sql (company_state) -> הקובץ הזה -> migrations/202609120001 ו-202609120002 (הן מפנות ל-career_jobs).
-- schemas auth ו-storage כבר קיימים ב-Supabase האמיתי ולא נוצרים כאן.

create table if not exists public.career_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company_name text,
  role_title text,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.career_communications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text,
  type text,
  content text,
  delivered boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.career_jobs enable row level security;
alter table public.career_communications enable row level security;

drop policy if exists career_jobs_owner on public.career_jobs;
create policy career_jobs_owner on public.career_jobs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists career_communications_owner on public.career_communications;
create policy career_communications_owner on public.career_communications for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.career_jobs, public.career_communications to authenticated;
