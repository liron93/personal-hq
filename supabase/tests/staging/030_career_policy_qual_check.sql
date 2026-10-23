-- בדיקת ה-`qual` האמיתי של policies ב-career_jobs וב-career_communications. קריאה בלבד (קורא pg_policies/pg_class בלבד),
-- לכן אפשר להריץ גם על production. חייב להיות owner-only: user_id = auth.uid() לכל פעולה, ורק ל-authenticated.
-- פלט: טבלת temp בשם qual_results (name, expected, actual). כל שורה שבה expected <> actual היא כשל.
-- מנרמל טקסט (אותיות קטנות, בלי רווחים וסוגריים) כך ש-(SELECT auth.uid() AS uid) = user_id ו-auth.uid() = user_id שקולים,
-- אבל using (true), or, is_workspace_member וכל ביטוי אחר נכשלים.

create temp table qual_results (name text, expected text, actual text);

create function pg_temp.norm(e text) returns text language sql immutable as $$
  select regexp_replace(lower(coalesce(e, '')), '[\s()]', '', 'g') $$;
-- מקבל בדיוק: [select] auth.uid() [as uid] = user_id  (או user_id = auth.uid())
create function pg_temp.owner_only(e text) returns boolean language sql immutable as $$
  select pg_temp.norm(e) ~ '^(select)?auth\.uid(asuid)?=user_id$' or pg_temp.norm(e) ~ '^user_id=(select)?auth\.uid(asuid)?$' $$;

do $$
declare t text; c text; rls boolean;
begin
  foreach t in array array['career_jobs', 'career_communications'] loop
    select c1.relrowsecurity into rls from pg_class c1 join pg_namespace n on n.oid = c1.relnamespace
      where n.nspname = 'public' and c1.relname = t;
    insert into qual_results values (t || ': table exists', 'true', (rls is not null)::text);
    insert into qual_results values (t || ': RLS enabled', 'true', coalesce(rls::text, 'false'));

    -- כל policy: רק authenticated (לא anon/public), ו-qual/with_check owner-only היכן שרלוונטי
    insert into qual_results
    select t || ': policy ' || p.policyname || ' (' || p.cmd || ') roles', '{authenticated}', p.roles::text
    from pg_policies p where p.schemaname = 'public' and p.tablename = t;
    insert into qual_results
    select t || ': policy ' || p.policyname || ' (' || p.cmd || ') qual', 'owner-only',
           case when p.cmd = 'INSERT' then case when p.qual is null then 'owner-only' else 'unexpected-qual' end
                when pg_temp.owner_only(p.qual) then 'owner-only' else 'NOT owner-only: ' || coalesce(p.qual, 'null') end
    from pg_policies p where p.schemaname = 'public' and p.tablename = t;
    insert into qual_results
    select t || ': policy ' || p.policyname || ' (' || p.cmd || ') with_check', 'owner-only',
           case when p.cmd in ('SELECT', 'DELETE') then case when p.with_check is null then 'owner-only' else 'unexpected-with-check' end
                when pg_temp.owner_only(case when p.cmd in ('ALL', 'UPDATE') then coalesce(p.with_check, p.qual) else p.with_check end) then 'owner-only'
                else 'NOT owner-only: ' || coalesce(p.with_check, 'null') end
    from pg_policies p where p.schemaname = 'public' and p.tablename = t;

    -- כיסוי: כל אחת מארבע הפעולות מכוסה ב-policy אחת לפחות (ALL מכסה את כולן)
    foreach c in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      insert into qual_results values (t || ': ' || c || ' covered by a policy', 'true',
        exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t and p.cmd in (c, 'ALL'))::text);
    end loop;
  end loop;
end $$;

-- תוצאה: מציג רק כשלים (ריק = הכול עבר). לרשימה מלאה: select * from qual_results order by name;
select name, expected, actual from qual_results where expected <> actual order by name;
