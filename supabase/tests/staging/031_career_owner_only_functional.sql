-- בדיקה פונקציונלית של owner-only ב-career_jobs וב-career_communications. **STAGING בלבד**: כותב משתמשי דמו ושורות, ואז מבטל הכול.
-- שומר בטיחות: מסרב אם ב-auth.users יש משתמש שאינו אחד ממזהי הדמו (כלומר משתמש אמיתי = לא staging).
-- פלט: טבלת temp בשם func_results (name, expected, actual). כל שורה שבה expected <> actual היא כשל.

create temp table func_results (name text, expected text, actual text);

do $$
declare
  a uuid := '11111111-1111-4111-8111-111111111111'; b uuid := '22222222-2222-4222-8222-222222222222';
  real_users int; t text; r jsonb := '{}'::jsonb; n bigint; ok boolean;
begin
  select count(*) into real_users from auth.users
    where id not in (a, b, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                     'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  if real_users > 0 then raise exception 'STAGING GUARD: יש % משתמשים שאינם דמו. לא מריצים.', real_users using errcode = 'P0001'; end if;

  begin
    insert into auth.users (id) values (a), (b);
    insert into public.career_jobs (user_id, company_name) values (a, 'a-job');
    insert into public.career_communications (user_id, title) values (a, 'a-msg');

    foreach t in array array['career_jobs', 'career_communications'] loop
      -- b (זר): לא רואה, לא מעדכן, לא מוחק ולא יוצר שורה על שם a
      perform set_config('request.jwt.claim.sub', b::text, true); execute 'set local role authenticated';
      execute format('select count(*) from public.%I where user_id = %L', t, a) into n;
      r := r || jsonb_build_object(t || ': stranger select', n::text);
      execute format('update public.%I set user_id = user_id where user_id = %L', t, a); get diagnostics n = row_count;
      r := r || jsonb_build_object(t || ': stranger update', n::text);
      execute format('delete from public.%I where user_id = %L', t, a); get diagnostics n = row_count;
      r := r || jsonb_build_object(t || ': stranger delete', n::text);
      begin
        execute format('insert into public.%I (user_id) values (%L)', t, a); ok := true;
      exception when insufficient_privilege then ok := false; end;
      r := r || jsonb_build_object(t || ': stranger insert as owner', case when ok then 'allowed' else 'denied' end);
      -- a (הבעלים) רואה את שלו
      perform set_config('request.jwt.claim.sub', a::text, true);
      execute format('select count(*) from public.%I where user_id = %L', t, a) into n;
      r := r || jsonb_build_object(t || ': owner select', n::text);
      -- anon לא רואה כלום (הרשאה חסרה או RLS: בשני המקרים 0)
      execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); execute 'set local role anon';
      begin
        execute format('select count(*) from public.%I', t) into n; r := r || jsonb_build_object(t || ': anon select', n::text);
      exception when insufficient_privilege then r := r || jsonb_build_object(t || ': anon select', '0'); end;
      execute 'reset role';
    end loop;
    raise exception 'undo' using errcode = 'P9001';
  exception when sqlstate 'P9001' then null; end;

  perform set_config('request.jwt.claim.sub', '', true);
  insert into func_results
  select k, case when k like '%owner select' then '1' when k like '%insert as owner' then 'denied' else '0' end, v
  from jsonb_each_text(r) as x(k, v);
end $$;

select name, expected, actual from func_results where expected <> actual order by name;
