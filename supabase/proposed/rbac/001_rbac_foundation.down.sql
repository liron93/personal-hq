-- החזרה לאחור של 001_rbac_foundation.sql. מוחק רק את מה ש-001 יצר (טבלאות ופונקציות של RBAC).
-- לא נוגע ב-company_state, בטבלאות career_*, ב-Storage או בנתונים של אף משתמש.
-- אזהרה: workspace_state מכיל את המצב המשותף. אם כבר הועתקו אליו נתונים, ייצא אותם לפני ההרצה
-- (ראה docs/rbac/ROLLOUT.md). ההעתקה המקורית לא מחקה את השורות ב-company_state, אז המקור נשאר.

begin;

drop trigger if exists workspace_state_guard on public.workspace_state;
drop function if exists public.workspace_state_guard();

drop function if exists public.rbac_remove_member(uuid, uuid);
drop function if exists public.rbac_revoke(uuid, uuid, text);
drop function if exists public.rbac_grant(uuid, uuid, text);
drop function if exists public.rbac_approve_member(uuid, uuid, text);
drop function if exists public.rbac_require_owner(uuid);

drop table if exists public.permission_audit;
drop table if exists public.workspace_state;
drop table if exists public.member_capabilities;
drop table if exists public.workspace_members;
drop table if exists public.company_capability_map;
drop table if exists public.role_templates;
drop table if exists public.capabilities;

-- הטבלה workspaces נמחקת לפני פונקציות העזר, כי ה-policy שלה תלוי ב-is_workspace_member.
drop table if exists public.workspaces;

drop function if exists public.can_access_state(uuid, text, boolean);
drop function if exists public.has_capability(uuid, text);
drop function if exists public.is_workspace_member(uuid);
drop function if exists public.is_workspace_owner(uuid);

commit;
