-- החזרה לאחור של 001_career_email_updates.sql. מוחק רק את career_email_updates -
-- לא נוגע ב-career_jobs או בכל טבלת career_* אחרת, ולא בנתוני אף משתמש שם.

drop index if exists public.career_email_updates_user_pending_idx;
drop policy if exists career_email_updates_owner on public.career_email_updates;
drop table if exists public.career_email_updates;
