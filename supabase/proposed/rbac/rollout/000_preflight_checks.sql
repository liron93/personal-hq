-- בדיקות לפני הפעלה: קריאה בלבד, אפשר להריץ ב-SQL Editor של Supabase (production או branch). לא משנה שום דבר.
-- מטרה: לאמת מה שהריפו לא יכול להוכיח בעצמו (למשל career_jobs / career_communications אינן ב-migration כלשהו).

-- 1. האם ל-RLS פעיל בכל טבלה ב-public? (מצופה: אין שורות עם rls_enabled = false)
select c.relname as table_name, c.relrowsecurity as rls_enabled, coalesce(p.n, 0) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join (select tablename, count(*) as n from pg_policies where schemaname = 'public' group by 1) p on p.tablename = c.relname
where n.nspname = 'public' and c.relkind = 'r'
order by rls_enabled, c.relname;

-- 2. policies שאינן מתייחסות למשתמש המחובר או לפונקציות ההרשאה. כל שורה כאן דורשת בדיקה ידנית (using (true) וכד').
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and coalesce(qual, '') !~ 'auth\.uid|is_workspace|has_capability|can_access'
  and coalesce(with_check, '') !~ 'auth\.uid|is_workspace|has_capability|can_access'
order by tablename, policyname;

-- 3. הרשאות ישירות של anon על טבלאות ב-public (מצופה: אין שורות)
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
order by table_name, privilege_type;

-- 4. שתי הטבלאות שהקוד משתמש בהן ואינן ב-migration בריפו: ה-RLS האמיתי שלהן חייב להיות user_id = auth.uid() לכל פעולה.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('career_jobs', 'career_communications');
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' and tablename in ('career_jobs', 'career_communications')
order by tablename, cmd;

-- 5. Storage: policies קיימות ו-buckets (career-documents חייב להיות פרטי)
select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;
select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;

-- 6. כמה משתמשים קיימים. (הגדרת "Allow new users to sign up" אינה נראית ב-SQL: לבדוק ב-Dashboard > Authentication > Providers/Settings.)
select count(*) as users from auth.users;
