-- מוצע בלבד - לא הורץ. לביקורת עמית ואישור לירון לפני הרצה ב-SQL Editor.
--
-- טבלה חדשה: הצעות עדכון סטטוס מועמדות שמתגלות מסריקת מייל (Issue #7, P0 של עמית:
-- "רועי: סריקת מייל יומית לעדכון מועמדויות"). שלב 1 (הנוכחי) בונה רק את המודל/ה-UI -
-- הטבלה נשארת ריקה עד שלב נפרד, מאושר בנפרד, שמחבר סוכן/Gmail אמיתי שממלא אותה.
--
-- **לעולם לא עדכון אוטומטי**: השורה כאן היא רק הצעה (review_status='pending'). שינוי בפועל
-- בסטטוס המועמדות (career_jobs.status) קורה רק כשלירון לוחץ "אישור" באפליקציה - ראו
-- review_status ותיעוד ב-companies/avoda/CareerExpansion.jsx::EmailUpdatesHub.
--
-- job_id אופציונלי בכוונה: כשאין שיוך בטוח למשרה קיימת (לפי שם חברה+כותרת+דומיין השולח+
-- שרשור, כמו שדרש עמית), job_id נשאר null וה-UI מציג "דורש שיוך ידני" - בלי לנחש.
create table if not exists public.career_email_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.career_jobs(id) on delete set null,
  company_name text not null,
  role_title text,
  proposed_status text not null check (proposed_status in ('considering','applied','interview','offer','rejected','withdrawn')),
  summary text,
  source_label text not null default 'gmail',
  source_link text,
  detected_at timestamptz not null default now(),
  review_status text not null default 'pending' check (review_status in ('pending','approved','dismissed')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.career_email_updates enable row level security;

-- owner-only, אותו דפוס בדיוק כמו career_jobs/career_profiles הקיימות (ראו
-- supabase/tests/rbac_matrix.sql ו-rbac-runner.mjs).
create policy career_email_updates_owner on public.career_email_updates
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists career_email_updates_user_pending_idx
  on public.career_email_updates (user_id, review_status, detected_at desc);
