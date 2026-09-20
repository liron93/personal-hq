-- מטריצת allow/deny ל-RBAC של personal-hq. SQL רגיל (לא pgTAP) כדי שירוץ גם ב-psql, גם ב-Supabase SQL editor על
-- branch/DB מקומי וגם ב-PGlite (ראה supabase/tests/rbac-runner.mjs). **לא להריץ על production**: הבדיקות
-- כותבות נתוני דמו (משתמשים מזויפים ב-auth.users). כל בדיקה רצה בתת-טרנזקציה שמתבטלת, כדי שהתוצאה לא תשתנה.
--
-- דמויות (מזהים מזויפים בלבד): owner = לירון, partner = ליאור, designer = שקד, stranger = משתמש זר עם מרחב משלו.
-- הפלט: טבלת temp בשם results (name, expected, actual). כל שורה שבה expected <> actual היא כשל.

create temp table results (name text, expected text, actual text);

create function pg_temp.owner_id()    returns uuid language sql immutable as $$ select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid $$;
create function pg_temp.partner_id()  returns uuid language sql immutable as $$ select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid $$;
create function pg_temp.designer_id() returns uuid language sql immutable as $$ select 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid $$;
create function pg_temp.stranger_id() returns uuid language sql immutable as $$ select 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid $$;
create function pg_temp.home_ws()     returns uuid language sql immutable as $$ select 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid $$;
create function pg_temp.other_ws()    returns uuid language sql immutable as $$ select 'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid $$;
create function pg_temp.who(label text) returns uuid language sql immutable as $$
  select case label when 'owner' then pg_temp.owner_id() when 'partner' then pg_temp.partner_id()
                    when 'designer' then pg_temp.designer_id() when 'stranger' then pg_temp.stranger_id() end $$;

-- מריץ פקודה כמשתמש (role authenticated + claim), מחזיר allowed/denied/error:<sqlstate> ומבטל את כל תופעות הלוואי.
-- kind: rows = allowed אם השפיעה על לפחות שורה אחת; value = הערך של העמודה הראשונה; call = allowed אם לא נזרקה שגיאה.
-- u = null מריץ כ-anon.
create function pg_temp.run_as(u uuid, stmt text, kind text default 'rows') returns text
language plpgsql as $$
declare res text := 'denied'; n bigint; v text;
begin
  begin
    perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
    execute 'set local role ' || case when u is null then 'anon' else 'authenticated' end;
    if kind = 'rows' then execute stmt; get diagnostics n = row_count; res := case when n > 0 then 'allowed' else 'denied' end;
    elsif kind = 'value' then execute stmt into v; res := coalesce(v, 'null');
    else execute stmt; res := 'allowed'; end if;
    raise exception 'undo' using errcode = 'P9001';
  exception
    when sqlstate 'P9001' then null;
    when insufficient_privilege then res := 'denied';
    when unique_violation then res := 'allowed'; -- ה-RLS עבר; ההתנגשות היא רק במפתח שכבר קיים
    when others then res := 'error:' || sqlstate;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  return res;
end $$;

-- מריץ פקודת setup כמשתמש (בלי ביטול). נכשל בקול אם נדחתה.
create function pg_temp.do_as(u uuid, stmt text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  execute 'set local role authenticated';
  execute stmt;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create function pg_temp.expect(n text, e text, a text) returns void language sql as $$ insert into results values (n, e, a) $$;

-- ---------- fixtures (כסופר-יוזר) ----------
insert into auth.users (id) values (pg_temp.owner_id()), (pg_temp.partner_id()), (pg_temp.designer_id()), (pg_temp.stranger_id());
insert into public.workspaces (id, kind, name, owner_id) values
  (pg_temp.home_ws(),  'shared', 'home',  pg_temp.owner_id()),
  (pg_temp.other_ws(), 'shared', 'other', pg_temp.stranger_id());
insert into public.workspace_state (workspace_id, company_key, data) values
  (pg_temp.home_ws(), 'hq:beit-hadash:v2', '{"a":1}'), (pg_temp.home_ws(), 'hq:kesef:v1', '{"a":1}'),
  (pg_temp.home_ws(), 'hq:kesef-transactions:v1', '{"a":1}'), (pg_temp.home_ws(), 'hq:core:v1', '{"a":1}'),
  (pg_temp.home_ws(), 'hq:unmapped:v1', '{"a":1}'),
  (pg_temp.home_ws(), 'hq:wellbeing:v3', '{"copied_by_mistake":true}'),   -- מפתח אישי שהועתק בטעות: חייב להישאר owner בלבד
  (pg_temp.other_ws(), 'hq:beit-hadash:v2', '{"a":1}');
-- נתונים אישיים קיימים (לפי משתמש), כמו שהאפליקציה שומרת היום
insert into public.company_state (user_id, company_key, data) values
  (pg_temp.owner_id(), 'hq:wellbeing:v3', '{"private":1}'), (pg_temp.owner_id(), 'hq:health:v1', '{"private":1}'),
  (pg_temp.owner_id(), 'career-v1', '{"private":1}'), (pg_temp.owner_id(), 'hq:kesef:v1', '{"private":1}'),
  (pg_temp.partner_id(), 'career-v1', '{"hers":1}');
insert into public.career_profiles (user_id, full_name) values (pg_temp.owner_id(), 'owner private'), (pg_temp.partner_id(), 'partner own');
insert into public.career_cvs (user_id, storage_path, filename, mime_type, size_bytes) values
  (pg_temp.owner_id(), pg_temp.owner_id()::text || '/cv.pdf', 'cv.pdf', 'application/pdf', 1);
insert into public.career_jobs (user_id, company_name) values (pg_temp.owner_id(), 'owner private job');
insert into storage.objects (bucket_id, name) values ('career-documents', pg_temp.owner_id()::text || '/cv.pdf');

-- ---------- onboarding: ה-owner מאשר חברים (דרך הפונקציות בלבד) ----------
select pg_temp.do_as(pg_temp.owner_id(), format($q$select public.rbac_approve_member(%L, %L, 'partner_budget_view')$q$, pg_temp.home_ws(), pg_temp.partner_id()));
select pg_temp.do_as(pg_temp.owner_id(), format($q$select public.rbac_approve_member(%L, %L, 'designer_beit_hadash')$q$, pg_temp.home_ws(), pg_temp.designer_id()));

-- ---------- מטריצה מונחית נתונים: ops = s(select) i(insert) u(update) d(delete) ----------
create temp table spec (label text, k text, ops text);

create function pg_temp.run_matrix(phase text) returns void language plpgsql as $$
declare r record; o record; stmt text; want text;
begin
  for r in select * from spec loop
    for o in select * from (values ('s', 'select'), ('i', 'insert'), ('u', 'update'), ('d', 'delete')) v(c, name) loop
      stmt := case o.name
        when 'select' then format($f$select 1 from public.workspace_state where workspace_id=%L and company_key=%L$f$, pg_temp.home_ws(), r.k)
        when 'insert' then format($f$insert into public.workspace_state(workspace_id, company_key, data) values (%L,%L,'{}')$f$, pg_temp.home_ws(), r.k)
        when 'update' then format($f$update public.workspace_state set data = data || '{"t":1}' where workspace_id=%L and company_key=%L$f$, pg_temp.home_ws(), r.k)
        else format($f$delete from public.workspace_state where workspace_id=%L and company_key=%L$f$, pg_temp.home_ws(), r.k) end;
      want := case when position(o.c in r.ops) > 0 then 'allowed' else 'denied' end;
      perform pg_temp.expect(phase || ' | ' || r.label || ' ' || o.name || ' ' || r.k, want, pg_temp.run_as(pg_temp.who(split_part(r.label, ' ', 1)), stmt));
    end loop;
  end loop;
end $$;

-- שלב 1: ליאור=partner_budget_view (אפשרות A, ברירת מחדל), שקד=designer_beit_hadash
truncate spec;
insert into spec values
  ('owner hq', 'hq:beit-hadash:v2', 'siud'), ('owner hq', 'hq:kesef:v1', 'siud'), ('owner hq', 'hq:kesef-transactions:v1', 'siud'), ('owner hq', 'hq:core:v1', 'siud'), ('owner hq', 'hq:unmapped:v1', 'siud'), ('owner hq', 'hq:wellbeing:v3', 'siud'),
  ('partner hq', 'hq:beit-hadash:v2', 'siu'), ('partner hq', 'hq:kesef:v1', 's'), ('partner hq', 'hq:kesef-transactions:v1', ''), ('partner hq', 'hq:core:v1', 's'), ('partner hq', 'hq:unmapped:v1', ''), ('partner hq', 'hq:wellbeing:v3', ''),
  ('designer hq', 'hq:beit-hadash:v2', 'siu'), ('designer hq', 'hq:kesef:v1', ''), ('designer hq', 'hq:kesef-transactions:v1', ''), ('designer hq', 'hq:core:v1', ''), ('designer hq', 'hq:unmapped:v1', ''), ('designer hq', 'hq:wellbeing:v3', ''),
  ('stranger hq', 'hq:beit-hadash:v2', ''), ('stranger hq', 'hq:kesef:v1', ''), ('stranger hq', 'hq:kesef-transactions:v1', ''), ('stranger hq', 'hq:core:v1', ''), ('stranger hq', 'hq:unmapped:v1', ''), ('stranger hq', 'hq:wellbeing:v3', '');
select pg_temp.run_matrix('P1 default (option A)');

-- שלב 2: אפשרות A+ (עריכת תקציב). תנועות גולמיות עדיין סגורות.
select pg_temp.do_as(pg_temp.owner_id(), format($q$select public.rbac_approve_member(%L, %L, 'partner_budget_edit')$q$, pg_temp.home_ws(), pg_temp.partner_id()));
truncate spec;
insert into spec values ('partner hq', 'hq:kesef:v1', 'siu'), ('partner hq', 'hq:kesef-transactions:v1', ''), ('partner hq', 'hq:core:v1', 's');
select pg_temp.run_matrix('P2 budget edit (A+)');

-- שלב 3: אפשרות B (ההחלטה של לירון והברירת מחדל): רואה את כל הכספים כולל תנועות, בקריאה בלבד. הבחירה היא הרשאה, לא קוד.
-- approve מוסיף יכולות ולא מסיר, ולכן עוברים קודם דרך remove כדי לקבל בדיוק את החבילה.
select pg_temp.do_as(pg_temp.owner_id(), format($q$select public.rbac_remove_member(%L, %L)$q$, pg_temp.home_ws(), pg_temp.partner_id()));
select pg_temp.do_as(pg_temp.owner_id(), format($q$select public.rbac_approve_member(%L, %L, 'partner_full_finance')$q$, pg_temp.home_ws(), pg_temp.partner_id()));
truncate spec;
insert into spec values
  ('partner hq', 'hq:beit-hadash:v2', 'siu'), ('partner hq', 'hq:kesef:v1', 's'), ('partner hq', 'hq:kesef-transactions:v1', 's'), ('partner hq', 'hq:core:v1', 's'),
  ('partner hq', 'hq:unmapped:v1', ''), ('partner hq', 'hq:wellbeing:v3', ''), ('designer hq', 'hq:kesef-transactions:v1', ''), ('designer hq', 'hq:kesef:v1', '');
select pg_temp.run_matrix('P3 B: full finance, read only (default)');

-- שלב 3ב: אפשרות B+ = B וגם עריכת תקציב ותנועות.
select pg_temp.do_as(pg_temp.owner_id(), format($q$select public.rbac_approve_member(%L, %L, 'partner_full_finance_edit')$q$, pg_temp.home_ws(), pg_temp.partner_id()));
truncate spec;
insert into spec values ('partner hq', 'hq:kesef:v1', 'siu'), ('partner hq', 'hq:kesef-transactions:v1', 'siu'), ('partner hq', 'hq:core:v1', 's'), ('partner hq', 'hq:unmapped:v1', ''), ('partner hq', 'hq:wellbeing:v3', ''), ('designer hq', 'hq:kesef-transactions:v1', '');
select pg_temp.run_matrix('P3b B+: full finance with edit');

-- שלב 4: ביטול יכולת בודדת מחזיר את התנועות לסגורות מיד.
select pg_temp.do_as(pg_temp.owner_id(), format($q$select public.rbac_revoke(%L, %L, 'finance.transactions.read')$q$, pg_temp.home_ws(), pg_temp.partner_id()));
select pg_temp.do_as(pg_temp.owner_id(), format($q$select public.rbac_revoke(%L, %L, 'finance.transactions.write')$q$, pg_temp.home_ws(), pg_temp.partner_id()));
truncate spec;
insert into spec values ('partner hq', 'hq:kesef-transactions:v1', ''), ('partner hq', 'hq:kesef:v1', 'siu');
select pg_temp.run_matrix('P4 revoke transactions');

-- שלב 5: הסרת חבר = ביטול מיידי של הכול.
select pg_temp.do_as(pg_temp.owner_id(), format($q$select public.rbac_remove_member(%L, %L)$q$, pg_temp.home_ws(), pg_temp.partner_id()));
truncate spec;
insert into spec values ('partner hq', 'hq:beit-hadash:v2', ''), ('partner hq', 'hq:kesef:v1', ''), ('partner hq', 'hq:core:v1', ''), ('designer hq', 'hq:beit-hadash:v2', 'siu');
select pg_temp.run_matrix('P5 member removed');

-- שלב 6: אישור מחדש מחזיר לברירת המחדל (אפשרות A) ולא ל-B.
select pg_temp.do_as(pg_temp.owner_id(), format($q$select public.rbac_approve_member(%L, %L, 'partner_budget_view')$q$, pg_temp.home_ws(), pg_temp.partner_id()));
truncate spec;
insert into spec values ('partner hq', 'hq:beit-hadash:v2', 'siu'), ('partner hq', 'hq:kesef:v1', 's'), ('partner hq', 'hq:kesef-transactions:v1', '');
select pg_temp.run_matrix('P6 re-approved as A');

-- שלב 7 (הגנה בעומק): שורת החבר בוטלה אבל שורות היכולות נשארו שלמות (למשל תקלה חלקית). הגישה חייבת להיסגר בכל זאת.
update public.workspace_members set revoked_at = now() where workspace_id = pg_temp.home_ws() and user_id = pg_temp.partner_id();
truncate spec;
insert into spec values ('partner hq', 'hq:beit-hadash:v2', ''), ('partner hq', 'hq:kesef:v1', ''), ('partner hq', 'hq:core:v1', '');
select pg_temp.run_matrix('P7 member row revoked, capability rows intact');
update public.workspace_members set revoked_at = null where workspace_id = pg_temp.home_ws() and user_id = pg_temp.partner_id();

-- בידוד בין מרחבים: לא ניתן לגעת במרחב של אחר. (ה-owner של home אינו חבר ב-other, וההפך.)
select pg_temp.expect('isolation: partner cannot read other workspace', 'denied',
  pg_temp.run_as(pg_temp.partner_id(), format($q$select 1 from public.workspace_state where workspace_id=%L$q$, pg_temp.other_ws())));
select pg_temp.expect('isolation: home owner cannot read other workspace', 'denied',
  pg_temp.run_as(pg_temp.owner_id(), format($q$select 1 from public.workspace_state where workspace_id=%L$q$, pg_temp.other_ws())));
select pg_temp.expect('isolation: partner cannot write into other workspace', 'denied',
  pg_temp.run_as(pg_temp.partner_id(), format($q$insert into public.workspace_state(workspace_id, company_key, data) values (%L,'hq:beit-hadash:v2','{}')$q$, pg_temp.other_ws())));

-- ---------- ניהול הרשאות: owner בלבד ----------
select pg_temp.expect('manage: ' || who || ' approve_member' || case when target = 'home' then '' else ' (other ws)' end, want,
  pg_temp.run_as(pg_temp.who(who), format($q$select public.rbac_approve_member(%L, %L, 'partner_budget_view')$q$, case when target = 'home' then pg_temp.home_ws() else pg_temp.other_ws() end, pg_temp.stranger_id()), 'call'))
from (values ('partner', 'home', 'denied'), ('designer', 'home', 'denied'), ('stranger', 'home', 'denied'), ('owner', 'other', 'denied')) v(who, target, want);
select pg_temp.expect('manage: ' || who || ' ' || fn, 'denied',
  pg_temp.run_as(pg_temp.who(who), case fn
    when 'grant' then format($q$select public.rbac_grant(%L, %L, 'finance.transactions.read')$q$, pg_temp.home_ws(), pg_temp.partner_id())
    when 'revoke' then format($q$select public.rbac_revoke(%L, %L, 'hq.view')$q$, pg_temp.home_ws(), pg_temp.designer_id())
    else format($q$select public.rbac_remove_member(%L, %L)$q$, pg_temp.home_ws(), pg_temp.designer_id()) end, 'call'))
from (values ('partner'), ('designer'), ('stranger')) a(who) cross join (values ('grant'), ('revoke'), ('remove_member')) f(fn);
select pg_temp.expect('manage: owner approve unknown template', 'error:22023',
  pg_temp.run_as(pg_temp.owner_id(), format($q$select public.rbac_approve_member(%L, %L, 'nope')$q$, pg_temp.home_ws(), pg_temp.stranger_id()), 'call'));
select pg_temp.expect('manage: owner cannot grant a capability outside the catalog', 'error:23503',
  pg_temp.run_as(pg_temp.owner_id(), format($q$select public.rbac_grant(%L, %L, 'finance.everything')$q$, pg_temp.home_ws(), pg_temp.partner_id()), 'call'));
select pg_temp.expect('manage: owner cannot grant to a non-member', 'error:22023',
  pg_temp.run_as(pg_temp.owner_id(), format($q$select public.rbac_grant(%L, %L, 'hq.view')$q$, pg_temp.home_ws(), pg_temp.stranger_id()), 'call'));
select pg_temp.expect('manage: owner cannot approve themself', 'error:22023',
  pg_temp.run_as(pg_temp.owner_id(), format($q$select public.rbac_approve_member(%L, %L, 'partner_budget_view')$q$, pg_temp.home_ws(), pg_temp.owner_id()), 'call'));
select pg_temp.expect('manage: workspace owner can manage their own workspace (stranger on other)', 'allowed',
  pg_temp.run_as(pg_temp.stranger_id(), format($q$select public.rbac_approve_member(%L, %L, 'designer_beit_hadash')$q$, pg_temp.other_ws(), pg_temp.designer_id()), 'call'));

-- ---------- שדות RBAC לא ניתנים לכתיבה ישירה מהלקוח, גם לא ל-owner ----------
select pg_temp.expect('direct write: ' || who || ' ' || t, 'denied', pg_temp.run_as(pg_temp.who(who), stmt))
from (values ('owner'), ('partner'), ('designer'), ('stranger')) a(who)
cross join (values
  ('insert workspaces', format($q$insert into public.workspaces(kind,name,owner_id) values ('shared','x',%L)$q$, pg_temp.stranger_id())),
  ('insert workspace_members', format($q$insert into public.workspace_members(workspace_id,user_id,added_by) values (%L,%L,%L)$q$, pg_temp.home_ws(), pg_temp.stranger_id(), pg_temp.stranger_id())),
  ('insert member_capabilities', format($q$insert into public.member_capabilities(workspace_id,user_id,capability,granted_by) values (%L,%L,'hq.view',%L)$q$, pg_temp.home_ws(), pg_temp.partner_id(), pg_temp.partner_id())),
  ('update member_capabilities', $q$update public.member_capabilities set revoked_at = null$q$),
  ('delete workspace_members', $q$delete from public.workspace_members$q$),
  ('insert permission_audit', format($q$insert into public.permission_audit(actor, action) values (%L,'x')$q$, pg_temp.stranger_id())),
  ('delete permission_audit', $q$delete from public.permission_audit$q$),
  ('insert capabilities', $q$insert into public.capabilities(key, description) values ('x.y','x')$q$),
  ('insert company_capability_map', $q$insert into public.company_capability_map(company_key, read_capability, write_capability) values ('hq:x:v1','hq.view','hq.view')$q$),
  ('update role_templates', $q$update public.role_templates set capability = 'hq.view'$q$)
) w(t, stmt);
select pg_temp.expect('anon: no access to ' || t, 'denied', pg_temp.run_as(null, 'select 1 from public.' || t))
from (values ('workspace_state'), ('workspaces'), ('workspace_members'), ('member_capabilities'), ('permission_audit'), ('capabilities'), ('company_capability_map'), ('role_templates')) a(t);

-- ---------- מה כל משתמש רואה בטבלאות ה-RBAC ----------
select pg_temp.expect('see: ' || who || ' workspace_members(home)', want,
  pg_temp.run_as(pg_temp.who(who), format($q$select count(*)::text from public.workspace_members where workspace_id=%L$q$, pg_temp.home_ws()), 'value'))
from (values ('owner', '2'), ('partner', '1'), ('designer', '1'), ('stranger', '0')) v(who, want);
select pg_temp.expect('see: ' || who || ' workspaces', want,
  pg_temp.run_as(pg_temp.who(who), $q$select count(*)::text from public.workspaces$q$, 'value'))
from (values ('owner', '1'), ('partner', '1'), ('designer', '1'), ('stranger', '1')) v(who, want);
select pg_temp.expect('see: partner sees only own capabilities (option A = 5)', '5',
  pg_temp.run_as(pg_temp.partner_id(), $q$select count(*)::text from public.member_capabilities where revoked_at is null$q$, 'value'));
select pg_temp.expect('see: designer sees only own capabilities (2)', '2',
  pg_temp.run_as(pg_temp.designer_id(), $q$select count(*)::text from public.member_capabilities where revoked_at is null$q$, 'value'));
select pg_temp.expect('see: audit visible to owner only (' || who || ')', want,
  pg_temp.run_as(pg_temp.who(who), format($q$select (count(*) > 0)::text from public.permission_audit where workspace_id=%L$q$, pg_temp.home_ws()), 'value'))
from (values ('owner', 'true'), ('partner', 'false'), ('designer', 'false'), ('stranger', 'false')) v(who, want);
select pg_temp.expect('audit: every owner action left a row', 'true',
  pg_temp.run_as(pg_temp.owner_id(), format($q$select (count(*) filter (where action='approve_member') = 6 and count(*) filter (where action='revoke') = 2 and count(*) filter (where action='remove_member') = 2)::text from public.permission_audit where workspace_id=%L$q$, pg_temp.home_ws()), 'value'));

-- ---------- שלמות workspace_state: מפתח בלתי משתנה, updated_by לא ניתן לזיוף ----------
select pg_temp.expect('state: cannot move a row to another key', 'denied',
  pg_temp.run_as(pg_temp.partner_id(), format($q$update public.workspace_state set company_key='hq:core:v1x' where workspace_id=%L and company_key='hq:beit-hadash:v2'$q$, pg_temp.home_ws())));
select pg_temp.expect('state: updated_by is the real actor even if spoofed', pg_temp.partner_id()::text,
  pg_temp.run_as(pg_temp.partner_id(), format($q$update public.workspace_state set data='{"x":1}', updated_by=%L where workspace_id=%L and company_key='hq:beit-hadash:v2' returning updated_by::text$q$, pg_temp.owner_id(), pg_temp.home_ws()), 'value'));

-- ---------- נתונים אישיים לא משותפים: בריאות/נפשי/קריירה נשארים לפי משתמש ----------
select pg_temp.expect('personal: ' || who || ' company_state sees only own rows', want,
  pg_temp.run_as(pg_temp.who(who), $q$select count(*)::text from public.company_state$q$, 'value'))
from (values ('owner', '4'), ('partner', '1'), ('designer', '0'), ('stranger', '0')) v(who, want);
select pg_temp.expect('personal: ' || who || ' cannot read owner wellbeing/health/career state', 'denied',
  pg_temp.run_as(pg_temp.who(who), format($q$select 1 from public.company_state where user_id=%L and company_key in ('hq:wellbeing:v3','hq:health:v1','career-v1')$q$, pg_temp.owner_id())))
from (values ('partner'), ('designer'), ('stranger')) a(who);
select pg_temp.expect('personal: partner cannot write owner rows', 'denied',
  pg_temp.run_as(pg_temp.partner_id(), format($q$update public.company_state set data='{"x":1}' where user_id=%L$q$, pg_temp.owner_id())));
select pg_temp.expect('personal: partner cannot insert a row as the owner', 'denied',
  pg_temp.run_as(pg_temp.partner_id(), format($q$insert into public.company_state(user_id, company_key, data) values (%L,'hq:evil:v1','{}')$q$, pg_temp.owner_id())));
select pg_temp.expect('career: ' || who || ' cannot read owner ' || t, 'denied',
  pg_temp.run_as(pg_temp.who(who), format($q$select 1 from public.%I where user_id=%L$q$, t, pg_temp.owner_id())))
from (values ('partner'), ('designer'), ('stranger')) a(who) cross join (values ('career_profiles'), ('career_cvs'), ('career_jobs')) c(t);
select pg_temp.expect('career: partner keeps her own empty-by-default workspace (own profile row)', 'allowed',
  pg_temp.run_as(pg_temp.partner_id(), format($q$select 1 from public.career_profiles where user_id=%L$q$, pg_temp.partner_id())));
select pg_temp.expect('career: partner cannot create rows owned by the owner', 'denied',
  pg_temp.run_as(pg_temp.partner_id(), format($q$insert into public.career_cvs(user_id, storage_path, filename, mime_type, size_bytes) values (%L,'x','x.pdf','application/pdf',1)$q$, pg_temp.owner_id())));
select pg_temp.expect('storage: ' || who || ' cannot read owner career documents', want,
  pg_temp.run_as(pg_temp.who(who), $q$select 1 from storage.objects where bucket_id='career-documents'$q$))
from (values ('owner', 'allowed'), ('partner', 'denied'), ('designer', 'denied')) v(who, want);

-- ---------- קבצים משותפים (bucket home-documents): אותן יכולות של בית חדש ----------
insert into storage.objects (bucket_id, name, owner_id) values
  ('home-documents', pg_temp.home_ws()::text || '/owner-plan.pdf',    pg_temp.owner_id()::text),
  ('home-documents', pg_temp.home_ws()::text || '/designer-file.pdf', pg_temp.designer_id()::text),
  ('home-documents', pg_temp.home_ws()::text || '/partner-file.pdf',  pg_temp.partner_id()::text),
  ('home-documents', pg_temp.other_ws()::text || '/stranger.pdf',     pg_temp.stranger_id()::text),
  ('home-documents', 'not-a-uuid/x.pdf',                              pg_temp.owner_id()::text);

create function pg_temp.obj(n text) returns text language sql immutable as $$
  select case n when 'owner-plan' then pg_temp.home_ws()::text || '/owner-plan.pdf'
                when 'designer-file' then pg_temp.home_ws()::text || '/designer-file.pdf'
                when 'partner-file' then pg_temp.home_ws()::text || '/partner-file.pdf'
                when 'other-ws' then pg_temp.other_ws()::text || '/stranger.pdf'
                else 'not-a-uuid/x.pdf' end $$;

select pg_temp.expect('files select: ' || who || ' ' || o, want,
  pg_temp.run_as(pg_temp.who(who), format($q$select 1 from storage.objects where bucket_id='home-documents' and name=%L$q$, pg_temp.obj(o))))
from (values
  ('owner','owner-plan','allowed'), ('owner','designer-file','allowed'), ('owner','partner-file','allowed'), ('owner','other-ws','denied'), ('owner','malformed','denied'),
  ('partner','owner-plan','allowed'), ('partner','designer-file','allowed'), ('partner','partner-file','allowed'), ('partner','other-ws','denied'), ('partner','malformed','denied'),
  ('designer','owner-plan','allowed'), ('designer','designer-file','allowed'), ('designer','partner-file','allowed'), ('designer','other-ws','denied'), ('designer','malformed','denied'),
  ('stranger','owner-plan','denied'), ('stranger','designer-file','denied'), ('stranger','partner-file','denied'), ('stranger','other-ws','allowed'), ('stranger','malformed','denied')
) v(who, o, want);

select pg_temp.expect('files insert: ' || who || ' ' || label, want,
  pg_temp.run_as(pg_temp.who(who), format($q$insert into storage.objects(bucket_id, name, owner_id) values (%L, %L, %L)$q$, bucket, path, pg_temp.who(who)::text)))
from (values
  ('owner',    'into home',            'home-documents', pg_temp.home_ws()::text || '/new-1.pdf', 'allowed'),
  ('partner',  'into home',            'home-documents', pg_temp.home_ws()::text || '/new-1.pdf', 'allowed'),
  ('designer', 'into home',            'home-documents', pg_temp.home_ws()::text || '/new-1.pdf', 'allowed'),
  ('stranger', 'into home',            'home-documents', pg_temp.home_ws()::text || '/new-1.pdf', 'denied'),
  ('partner',  'into other workspace', 'home-documents', pg_temp.other_ws()::text || '/new-1.pdf', 'denied'),
  ('partner',  'nested folder',        'home-documents', pg_temp.home_ws()::text || '/sub/new-1.pdf', 'denied'),
  ('partner',  'malformed workspace',  'home-documents', 'not-a-uuid/new-1.pdf', 'denied'),
  ('partner',  'career bucket, home path', 'career-documents', pg_temp.home_ws()::text || '/new-1.pdf', 'denied')
) v(who, label, bucket, path, want);

select pg_temp.expect('files update: ' || who || ' ' || label, want, pg_temp.run_as(pg_temp.who(who), stmt))
from (values
  ('partner',  'replace designer file', format($q$update storage.objects set name=name where bucket_id='home-documents' and name=%L$q$, pg_temp.obj('designer-file')), 'allowed'),
  ('designer', 'replace owner file',    format($q$update storage.objects set name=name where bucket_id='home-documents' and name=%L$q$, pg_temp.obj('owner-plan')), 'allowed'),
  ('stranger', 'replace home file',     format($q$update storage.objects set name=name where bucket_id='home-documents' and name=%L$q$, pg_temp.obj('owner-plan')), 'denied'),
  ('partner',  'move file to other workspace', format($q$update storage.objects set name=%L where bucket_id='home-documents' and name=%L$q$, pg_temp.other_ws()::text || '/moved.pdf', pg_temp.obj('partner-file')), 'denied'),
  ('partner',  'move file into a subfolder',   format($q$update storage.objects set name=%L where bucket_id='home-documents' and name=%L$q$, pg_temp.home_ws()::text || '/a/b.pdf', pg_temp.obj('partner-file')), 'denied')
) v(who, label, stmt, want);

select pg_temp.expect('files delete: ' || who || ' ' || o, want,
  pg_temp.run_as(pg_temp.who(who), format($q$delete from storage.objects where bucket_id='home-documents' and name=%L$q$, pg_temp.obj(o))))
from (values
  ('owner','partner-file','allowed'), ('owner','designer-file','allowed'), ('owner','owner-plan','allowed'),
  ('partner','partner-file','allowed'), ('partner','designer-file','denied'), ('partner','owner-plan','denied'),
  ('designer','designer-file','allowed'), ('designer','partner-file','denied'), ('designer','owner-plan','denied'),
  ('stranger','partner-file','denied'), ('stranger','owner-plan','denied')
) v(who, o, want);

-- הסרת חבר סוגרת גם את הקבצים מיד, ואישור מחדש מחזיר.
select pg_temp.do_as(pg_temp.owner_id(), format($q$select public.rbac_remove_member(%L, %L)$q$, pg_temp.home_ws(), pg_temp.partner_id()));
select pg_temp.expect('files: removed partner cannot read', 'denied',
  pg_temp.run_as(pg_temp.partner_id(), format($q$select 1 from storage.objects where bucket_id='home-documents' and name=%L$q$, pg_temp.obj('owner-plan'))));
select pg_temp.expect('files: removed partner cannot delete their own old upload', 'denied',
  pg_temp.run_as(pg_temp.partner_id(), format($q$delete from storage.objects where bucket_id='home-documents' and name=%L$q$, pg_temp.obj('partner-file'))));
select pg_temp.do_as(pg_temp.owner_id(), format($q$select public.rbac_approve_member(%L, %L, 'partner_budget_view')$q$, pg_temp.home_ws(), pg_temp.partner_id()));
select pg_temp.expect('files: re-approved partner can read again', 'allowed',
  pg_temp.run_as(pg_temp.partner_id(), format($q$select 1 from storage.objects where bucket_id='home-documents' and name=%L$q$, pg_temp.obj('owner-plan'))));
select pg_temp.expect('files: career documents stay owner-only (partner)', 'denied',
  pg_temp.run_as(pg_temp.partner_id(), $q$select 1 from storage.objects where bucket_id='career-documents'$q$));
select pg_temp.expect('files: bucket is private with a closed type list', 'true',
  pg_temp.run_as(pg_temp.owner_id(), $q$select (not public and file_size_limit = 26214400 and 'application/pdf' = any(allowed_mime_types) and not ('text/html' = any(allowed_mime_types)) and not ('image/svg+xml' = any(allowed_mime_types)))::text from storage.buckets where id='home-documents'$q$, 'value'));

-- ---------- קריאה בלבד מול כתיבה: שקד מאבדת רק את company.beit-hadash.write ----------
select pg_temp.do_as(pg_temp.owner_id(), format($q$select public.rbac_revoke(%L, %L, 'company.beit-hadash.write')$q$, pg_temp.home_ws(), pg_temp.designer_id()));
select pg_temp.expect('read-only designer: state select', 'allowed', pg_temp.run_as(pg_temp.designer_id(), format($q$select 1 from public.workspace_state where workspace_id=%L and company_key='hq:beit-hadash:v2'$q$, pg_temp.home_ws())));
select pg_temp.expect('read-only designer: state update', 'denied', pg_temp.run_as(pg_temp.designer_id(), format($q$update public.workspace_state set data = data || '{"t":1}' where workspace_id=%L and company_key='hq:beit-hadash:v2'$q$, pg_temp.home_ws())));
select pg_temp.expect('read-only designer: file select', 'allowed', pg_temp.run_as(pg_temp.designer_id(), format($q$select 1 from storage.objects where bucket_id='home-documents' and name=%L$q$, pg_temp.obj('owner-plan'))));
select pg_temp.expect('read-only designer: file insert', 'denied', pg_temp.run_as(pg_temp.designer_id(), format($q$insert into storage.objects(bucket_id, name, owner_id) values ('home-documents', %L, %L)$q$, pg_temp.home_ws()::text || '/ro.pdf', pg_temp.designer_id()::text)));
select pg_temp.expect('read-only designer: file replace', 'denied', pg_temp.run_as(pg_temp.designer_id(), format($q$update storage.objects set name=name where bucket_id='home-documents' and name=%L$q$, pg_temp.obj('owner-plan'))));
select pg_temp.expect('read-only designer: cannot delete even their own earlier upload', 'denied', pg_temp.run_as(pg_temp.designer_id(), format($q$delete from storage.objects where bucket_id='home-documents' and name=%L$q$, pg_temp.obj('designer-file'))));
select pg_temp.do_as(pg_temp.owner_id(), format($q$select public.rbac_approve_member(%L, %L, 'designer_beit_hadash')$q$, pg_temp.home_ws(), pg_temp.designer_id()));
select pg_temp.expect('restored designer: file insert works again', 'allowed', pg_temp.run_as(pg_temp.designer_id(), format($q$insert into storage.objects(bucket_id, name, owner_id) values ('home-documents', %L, %L)$q$, pg_temp.home_ws()::text || '/ro.pdf', pg_temp.designer_id()::text)));
