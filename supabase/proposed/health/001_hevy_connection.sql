-- ============================================================================
-- חיבור Hevy (בריאות) - PROPOSED PATCH, NOT APPLIED.
-- טבלה חדשה: שומרת מפתח API של Hevy של כל משתמש, מוצפן בצד השרת (AES-256-GCM,
-- lib/hevy-key.mjs) לפני שהוא נכתב לכאן. אף פעם לא ציפר-טקסט גלוי, ואף פעם לא נקרא דרך
-- ה-client הרגיל (anon+RLS) - רק דרך ה-API routes שלנו עם service-role
-- (SUPABASE_SERVICE_ROLE_KEY, ראה lib/supabase-admin.mjs), שמסננים תמיד לפי user_id
-- מה-session המאומת בלבד.
--
-- RLS מופעל בלי שום policy בכוונה - deny-by-default מוחלט: אין גישת קריאה/כתיבה מהלקוח
-- (anon/authenticated) לטבלה הזו בכלל, אפילו לא לשורה של עצמך. תיקון מ-review של עמית:
-- גרסה קודמת כללה policy ל-select של "השורה של עצמי" שחשב ל"הגנת-עומק" - אבל RLS הוא
-- ברמת שורה, לא עמודה, אז זה היה מאפשר למשתמש מחובר לקרוא ישירות את ה-encrypted_api_key
-- המוצפן של עצמו. זה לא חושף את מפתח Hevy הגולמי (הוא מוצפן), אבל זו חשיפה מיותרת שלא
-- תואמת את העיקרון שהוגדר: הטבלה הזו נקראת/נכתבת אך ורק דרך service-role
-- (SUPABASE_SERVICE_ROLE_KEY, lib/supabase-admin.mjs) בקוד השרת, שמסנן תמיד לפי user_id
-- מה-session המאומת - אף פעם לא דרך ה-client הרגיל, גם לא לציפר-טקסט.
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

-- במכוון: אין שום policy. RLS מופעל בלי אף מדיניות = אין גישה בכלל ל-anon/authenticated,
-- גם לא לשורה של עצמך. רק service-role (עוקף RLS) נוגע בטבלה הזו.

-- חיזוק נוסף (review שני של עמית): גם אם ל-anon/authenticated יש הרשאת table-level כלשהי
-- בברירת המחדל של הסכימה (grant רוחבי על public), היא לא תעזור להם לקרוא כלום בפועל (RLS
-- בלי policy כבר חוסם) - אבל שוללים אותה גם במפורש, כך שאין תלות שקטה ב-RLS בלבד.
revoke all on table public.health_hevy_connection from anon, authenticated;

commit;
