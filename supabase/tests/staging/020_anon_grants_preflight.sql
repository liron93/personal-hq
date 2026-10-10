-- Preflight לקריאה בלבד: הרשאות ישירות של anon ב-schema public. לא מבצע revoke ולא משנה שום דבר.
-- בטוח להריץ גם על production. ב-Supabase ברירת המחדל נותנת ל-anon הרשאות על טבלאות חדשות, וה-RLS הוא שמגן;
-- לכן כל שורה כאן דורשת החלטה של עמית: האם ה-RLS מכסה, ואז האם להוריד הרשאה (בנפרד, לא כאן).

-- 1. טבלאות/views: הרשאות מפורשות של anon (rls_enabled = false ב-kind r הוא ממצא חמור)
select n.nspname as schema, c.relname as object, c.relkind as kind, c.relrowsecurity as rls_enabled,
       string_agg(a.privilege_type, ', ' order by a.privilege_type) as anon_privileges
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(c.relacl) a
join pg_roles r on r.oid = a.grantee
where n.nspname = 'public' and r.rolname = 'anon' and c.relkind in ('r', 'p', 'v', 'm', 'f')
group by 1, 2, 3, 4
order by c.relrowsecurity, c.relname;

-- 2. פונקציות: הרשאת execute מפורשת של anon (proacl ריק = ברירת מחדל של PUBLIC ואינו מופיע כאן)
select n.nspname as schema, p.proname as function, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(p.proacl) a
join pg_roles r on r.oid = a.grantee
where n.nspname = 'public' and r.rolname = 'anon' and a.privilege_type = 'EXECUTE'
order by p.proname;

-- 3. ברירות מחדל עתידיות (default privileges) ש-anon מקבל על אובייקטים חדשים ב-public
select pg_get_userbyid(d.defaclrole) as for_role, d.defaclobjtype as objtype, d.defaclacl::text as acl
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public' and d.defaclacl::text like '%anon=%'
order by 1, 2;
