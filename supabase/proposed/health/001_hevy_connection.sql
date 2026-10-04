-- ============================================================================
-- חיבור Hevy (בריאות) - PROPOSED PATCH, NOT APPLIED.
-- טבלה חדשה: שומרת מפתח API של Hevy של כל משתמש, מוצפן בצד השרת (AES-256-GCM,
-- lib/hevy-key.mjs) לפני שהוא נכתב לכאן. אף פעם לא ציפר-טקסט גלוי, ואף פעם לא נקרא דרך
-- ה-client הרגיל (anon+RLS) - רק דרך ה-API routes שלנו עם service-role
-- (SUPABASE_SERVICE_ROLE_KEY, ראה lib/supabase-admin.mjs), שמסננים תמיד לפי user_id
-- מה-session המאומת בלבד.
--
-- RLS מופעל כהגנת-עומק בלבד (הגנה בפועל היא בקוד ה-handler, לא כאן): גם אם מישהו ישאל
-- את הטבלה הזו ישירות עם ה-anon key, owner יכול רק לראות/לגעת בשורה של עצמו - ולא דרך
-- מדיניות INSERT/UPDATE בכלל (שמירה קורית רק אחרי אימות המפתח מול Hevy בקוד השרת,
-- ראה lib/hevy-handler.mjs - אין צורך שה-client יוכל לכתוב ישירות).
-- ============================================================================

begin;

create table public.health_hevy_connection (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_api_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_checked_at timestamptz,
  last_check_ok boolean
);

alter table public.health_hevy_connection enable row level security;

-- הגנת-עומק בלבד: קריאת הסטטוס של עצמך (לא כולל encrypted_api_key - אין column-level
-- privilege כאן בכוונה כי הגישה האמיתית היא תמיד דרך service-role, לא הלקוח).
create policy health_hevy_connection_select_own on public.health_hevy_connection
  for select using (auth.uid() = user_id);

-- אין policies ל-insert/update/delete: רק service-role (שעוקף RLS) כותב לטבלה הזו,
-- אחרי שהמפתח כבר אומת מול Hevy בקוד השרת.

commit;
