-- ============================================================================
-- RBAC foundation for personal-hq  --  PROPOSED PATCH, NOT APPLIED.
-- הקובץ נמצא ב-supabase/proposed/ ולא ב-supabase/migrations/ בכוונה: אף כלי
-- (supabase db push) לא יחיל אותו לפני review של עמית ואישור מפורש של לירון.
-- עיצוב והסבר: docs/rbac/DESIGN.md. הוראות הפעלה והחזרה: docs/rbac/ROLLOUT.md.
--
-- עקרונות:
--  * deny by default: אין policy = אין גישה. anon ו-PUBLIC לא מקבלים כלום.
--  * הרשאות נגזרות רק מהטבלאות כאן. לעולם לא מ-user_metadata / app_metadata / JWT claims נוספים.
--  * כל כתיבה להרשאות עוברת דרך פונקציות SECURITY DEFINER של ה-owner בלבד, ומתועדת ב-permission_audit.
--  * נתונים אישיים (health, wellbeing, career) לא נוגעים כאן בכלל: הם נשארים ב-company_state /
--    career_* לפי auth.uid() = user_id. מרחב משותף מוגדר רק ל-workspace_state.
--  * אין service_role בדפדפן. שום דבר כאן לא דורש אותו.
-- ============================================================================

begin;

-- ---------- טבלאות ----------

create table public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('personal', 'shared')),
  name       text not null check (length(name) between 1 and 80),
  owner_id   uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

-- קטלוג יכולות סגור: אי אפשר להעניק יכולת שלא קיימת כאן.
create table public.capabilities (
  key         text primary key check (key ~ '^[a-z][a-z0-9_.-]*$'),
  description text not null
);

-- חבילות מוכנות להענקה (נוחות בלבד; ההרשאה בפועל נשמרת כשורות ב-member_capabilities).
create table public.role_templates (
  role       text not null check (role ~ '^[a-z][a-z0-9_]*$'),
  capability text not null references public.capabilities (key),
  primary key (role, capability)
);

-- איזו יכולת נדרשת כדי לקרוא/לכתוב מפתח מצב (company_key). מפתח שלא מופיע כאן = owner בלבד.
create table public.company_capability_map (
  company_key      text primary key,
  read_capability  text not null references public.capabilities (key),
  write_capability text not null references public.capabilities (key)
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  added_by     uuid not null references auth.users (id),
  added_at     timestamptz not null default now(),
  revoked_at   timestamptz,
  primary key (workspace_id, user_id)
);

create table public.member_capabilities (
  workspace_id uuid not null,
  user_id      uuid not null,
  capability   text not null references public.capabilities (key),
  granted_by   uuid not null references auth.users (id),
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  primary key (workspace_id, user_id, capability),
  foreign key (workspace_id, user_id) references public.workspace_members (workspace_id, user_id) on delete cascade
);

-- מצב משותף של חברות (במקום company_state שהוא לפי משתמש). PK לפי מרחב+מפתח.
create table public.workspace_state (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  company_key  text not null,
  data         jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  primary key (workspace_id, company_key)
);

-- יומן שינויי הרשאות. נכתב רק על ידי הפונקציות למטה; ה-owner בלבד קורא.
create table public.permission_audit (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor        uuid not null,
  action       text not null,
  workspace_id uuid,
  target_user  uuid,
  capability   text,
  detail       jsonb not null default '{}'::jsonb
);

-- ---------- פונקציות עזר (SECURITY DEFINER, search_path ריק, אין הרשאת PUBLIC) ----------

create function public.is_workspace_owner(ws uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.workspaces w where w.id = ws and w.owner_id = (select auth.uid()));
$$;

create function public.is_workspace_member(ws uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_workspace_owner(ws) or exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.revoked_at is null);
$$;

create function public.has_capability(ws uuid, cap text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_workspace_owner(ws) or exists (
    select 1
    from public.member_capabilities c
    join public.workspace_members m on m.workspace_id = c.workspace_id and m.user_id = c.user_id
    where c.workspace_id = ws and c.user_id = (select auth.uid()) and c.capability = cap
      and c.revoked_at is null and m.revoked_at is null);
$$;

-- owner: הכול במרחב שלו. אחרים: רק מפתח שמופיע במפה, ורק עם היכולת המתאימה (קריאה/כתיבה).
create function public.can_access_state(ws uuid, key text, for_write boolean) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_workspace_owner(ws) or exists (
    select 1 from public.company_capability_map m
    where m.company_key = key
      and public.has_capability(ws, case when for_write then m.write_capability else m.read_capability end));
$$;

-- ---------- ניהול הרשאות: owner בלבד, כל פעולה מתועדת ----------

create function public.rbac_require_owner(ws uuid) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_workspace_owner(ws) then
    raise exception 'owner only' using errcode = '42501';
  end if;
end;
$$;

create function public.rbac_approve_member(ws uuid, target uuid, template text) returns void
language plpgsql security definer set search_path = ''
as $$
declare granted int;
begin
  perform public.rbac_require_owner(ws);
  if target = (select auth.uid()) then raise exception 'owner is implicit, cannot be approved' using errcode = '22023'; end if;
  if not exists (select 1 from public.role_templates t where t.role = template) then
    raise exception 'unknown role template' using errcode = '22023';
  end if;
  insert into public.workspace_members (workspace_id, user_id, added_by)
  values (ws, target, (select auth.uid()))
  on conflict (workspace_id, user_id) do update set revoked_at = null, added_by = excluded.added_by, added_at = now();
  insert into public.member_capabilities (workspace_id, user_id, capability, granted_by)
  select ws, target, t.capability, (select auth.uid()) from public.role_templates t where t.role = template
  on conflict (workspace_id, user_id, capability) do update set revoked_at = null, granted_by = excluded.granted_by, granted_at = now();
  get diagnostics granted = row_count;
  insert into public.permission_audit (actor, action, workspace_id, target_user, detail)
  values ((select auth.uid()), 'approve_member', ws, target, jsonb_build_object('template', template, 'capabilities', granted));
end;
$$;

create function public.rbac_grant(ws uuid, target uuid, cap text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.rbac_require_owner(ws);
  if not exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = target and m.revoked_at is null) then
    raise exception 'target is not an active member' using errcode = '22023';
  end if;
  insert into public.member_capabilities (workspace_id, user_id, capability, granted_by)
  values (ws, target, cap, (select auth.uid()))
  on conflict (workspace_id, user_id, capability) do update set revoked_at = null, granted_by = excluded.granted_by, granted_at = now();
  insert into public.permission_audit (actor, action, workspace_id, target_user, capability)
  values ((select auth.uid()), 'grant', ws, target, cap);
end;
$$;

create function public.rbac_revoke(ws uuid, target uuid, cap text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.rbac_require_owner(ws);
  update public.member_capabilities set revoked_at = now()
  where workspace_id = ws and user_id = target and capability = cap and revoked_at is null;
  insert into public.permission_audit (actor, action, workspace_id, target_user, capability)
  values ((select auth.uid()), 'revoke', ws, target, cap);
end;
$$;

-- ביטול מיידי של כל הגישה של משתמש במרחב. הנתונים שלו לא נמחקים; השורות נשמרות לצורך audit.
create function public.rbac_remove_member(ws uuid, target uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.rbac_require_owner(ws);
  update public.member_capabilities set revoked_at = now() where workspace_id = ws and user_id = target and revoked_at is null;
  update public.workspace_members set revoked_at = now() where workspace_id = ws and user_id = target and revoked_at is null;
  insert into public.permission_audit (actor, action, workspace_id, target_user)
  values ((select auth.uid()), 'remove_member', ws, target);
end;
$$;

-- ---------- טריגרים על workspace_state ----------

create function public.workspace_state_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.workspace_id <> old.workspace_id or new.company_key <> old.company_key) then
    raise exception 'workspace_id and company_key are immutable' using errcode = '42501';
  end if;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;

create trigger workspace_state_guard before insert or update on public.workspace_state
for each row execute function public.workspace_state_guard();

-- ---------- RLS: מופעל בכל טבלה, ובלי policy לפעולה = אסור ----------

alter table public.workspaces            enable row level security;
alter table public.capabilities          enable row level security;
alter table public.role_templates        enable row level security;
alter table public.company_capability_map enable row level security;
alter table public.workspace_members     enable row level security;
alter table public.member_capabilities   enable row level security;
alter table public.workspace_state       enable row level security;
alter table public.permission_audit      enable row level security;

create policy workspaces_select on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));

create policy capabilities_select on public.capabilities for select to authenticated using (true);
create policy role_templates_select on public.role_templates for select to authenticated using (true);
create policy company_capability_map_select on public.company_capability_map for select to authenticated using (true);

-- חבר רואה רק את השורה של עצמו; owner רואה את כולם במרחב שלו.
create policy workspace_members_select on public.workspace_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_workspace_owner(workspace_id));
create policy member_capabilities_select on public.member_capabilities for select to authenticated
  using (user_id = (select auth.uid()) or public.is_workspace_owner(workspace_id));

create policy permission_audit_select on public.permission_audit for select to authenticated
  using (workspace_id is not null and public.is_workspace_owner(workspace_id));

-- workspace_state: policy נפרד לכל פעולה.
create policy workspace_state_select on public.workspace_state for select to authenticated
  using (public.can_access_state(workspace_id, company_key, false));
create policy workspace_state_insert on public.workspace_state for insert to authenticated
  with check (public.can_access_state(workspace_id, company_key, true));
create policy workspace_state_update on public.workspace_state for update to authenticated
  using (public.can_access_state(workspace_id, company_key, true))
  with check (public.can_access_state(workspace_id, company_key, true));
create policy workspace_state_delete on public.workspace_state for delete to authenticated
  using (public.is_workspace_owner(workspace_id));
-- workspaces / workspace_members / member_capabilities / permission_audit: אין policy לכתיבה.
-- לקוח לא יכול ליצור מרחב, להוסיף חבר, להעניק יכולת או לכתוב ביומן. רק הפונקציות למעלה (owner בלבד).

-- ---------- הרשאות ברמת הטבלה (belt and braces; ב-Supabase ברירת המחדל נותנת הכול ל-anon/authenticated) ----------

revoke all on public.workspaces, public.capabilities, public.role_templates, public.company_capability_map,
  public.workspace_members, public.member_capabilities, public.workspace_state, public.permission_audit
  from public, anon, authenticated;

grant select on public.workspaces, public.capabilities, public.role_templates, public.company_capability_map,
  public.workspace_members, public.member_capabilities, public.permission_audit to authenticated;
grant select, insert, update, delete on public.workspace_state to authenticated;

revoke all on function
  public.is_workspace_owner(uuid), public.is_workspace_member(uuid), public.has_capability(uuid, text),
  public.can_access_state(uuid, text, boolean), public.rbac_require_owner(uuid),
  public.rbac_approve_member(uuid, uuid, text), public.rbac_grant(uuid, uuid, text),
  public.rbac_revoke(uuid, uuid, text), public.rbac_remove_member(uuid, uuid)
  from public, anon;
grant execute on function
  public.is_workspace_owner(uuid), public.is_workspace_member(uuid), public.has_capability(uuid, text),
  public.can_access_state(uuid, text, boolean), public.rbac_approve_member(uuid, uuid, text),
  public.rbac_grant(uuid, uuid, text), public.rbac_revoke(uuid, uuid, text), public.rbac_remove_member(uuid, uuid)
  to authenticated;

-- ---------- זריעה: קטלוג יכולות, מפה, וחבילות ----------
-- (lib/authz/capabilities.js משקף בדיוק את הבלוקים האלה, ובדיקה מוודאת שהם זהים.)

-- BEGIN SEED capabilities
insert into public.capabilities (key, description) values
  ('hq.view',                       'מסך המנכ"ל (HQ). שער תצוגה בלבד, אין לו נתונים משלו'),
  ('company.beit-hadash.read',      'קריאת חברת בית חדש'),
  ('company.beit-hadash.write',     'עריכת חברת בית חדש'),
  ('finance.dashboard_budget.read', 'דשבורד ותקציב כספים (בלי תנועות גולמיות)'),
  ('finance.dashboard_budget.write','עריכת תקציב כספים'),
  ('finance.transactions.read',     'תנועות גולמיות וייבוא (רייזאפ) - קריאה'),
  ('finance.transactions.write',    'תנועות גולמיות וייבוא (רייזאפ) - כתיבה'),
  ('core.read',                     'נתוני ליבה משותפים של משק הבית (הכנסות, משכנתא) - קריאה'),
  ('core.write',                    'נתוני ליבה משותפים - עריכה');
-- END SEED capabilities

-- BEGIN SEED company_capability_map
insert into public.company_capability_map (company_key, read_capability, write_capability) values
  ('hq:beit-hadash:v2',        'company.beit-hadash.read',       'company.beit-hadash.write'),
  ('hq:kesef:v1',              'finance.dashboard_budget.read',  'finance.dashboard_budget.write'),
  ('hq:kesef-transactions:v1', 'finance.transactions.read',      'finance.transactions.write'),
  ('hq:core:v1',               'core.read',                      'core.write');
-- END SEED company_capability_map

-- BEGIN SEED role_templates
insert into public.role_templates (role, capability) values
  -- אפשרות A: דשבורד ותקציב בלבד, בלי תנועות גולמיות. קריאה בלבד בכספים.
  ('partner_budget_view', 'hq.view'),
  ('partner_budget_view', 'company.beit-hadash.read'),
  ('partner_budget_view', 'company.beit-hadash.write'),
  ('partner_budget_view', 'finance.dashboard_budget.read'),
  ('partner_budget_view', 'core.read'),
  -- אפשרות A+: כמו A, וגם עריכת התקציב.
  ('partner_budget_edit', 'hq.view'),
  ('partner_budget_edit', 'company.beit-hadash.read'),
  ('partner_budget_edit', 'company.beit-hadash.write'),
  ('partner_budget_edit', 'finance.dashboard_budget.read'),
  ('partner_budget_edit', 'finance.dashboard_budget.write'),
  ('partner_budget_edit', 'core.read'),
  -- אפשרות B (ההחלטה של לירון, 21.9.2026, וברירת המחדל לליאור): רואה את כל הכספים כולל תנועות וייבואי כספים.
  -- קריאה בלבד בכספים. עריכה בכספים היא חבילה נפרדת (B+), כדי שההרשאה תתאים למה שאושר: "רואה".
  ('partner_full_finance', 'hq.view'),
  ('partner_full_finance', 'company.beit-hadash.read'),
  ('partner_full_finance', 'company.beit-hadash.write'),
  ('partner_full_finance', 'finance.dashboard_budget.read'),
  ('partner_full_finance', 'finance.transactions.read'),
  ('partner_full_finance', 'core.read'),
  -- אפשרות B+: כמו B, וגם עריכת התקציב והתנועות/ייבואים.
  ('partner_full_finance_edit', 'hq.view'),
  ('partner_full_finance_edit', 'company.beit-hadash.read'),
  ('partner_full_finance_edit', 'company.beit-hadash.write'),
  ('partner_full_finance_edit', 'finance.dashboard_budget.read'),
  ('partner_full_finance_edit', 'finance.dashboard_budget.write'),
  ('partner_full_finance_edit', 'finance.transactions.read'),
  ('partner_full_finance_edit', 'finance.transactions.write'),
  ('partner_full_finance_edit', 'core.read'),
  -- מעצבת: בית חדש בלבד, בלי HQ ובלי כספים.
  ('designer_beit_hadash', 'company.beit-hadash.read'),
  ('designer_beit_hadash', 'company.beit-hadash.write');
-- END SEED role_templates

commit;
