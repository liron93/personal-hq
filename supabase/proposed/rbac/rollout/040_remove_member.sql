-- ביטול מיידי של כל הגישה של חבר במרחב (הנתונים שלו לא נמחקים; השורות נשמרות ל-audit).
-- מריצים כ-postgres/service_role (ברירת המחדל ב-SQL Editor), בלי לעבור ל-role authenticated: אחרי
-- הנעילה של Issue #7 (001_rbac_foundation.sql / 001b_rbac_rpc_lockdown.sql) לתפקיד authenticated
-- אין יותר EXECUTE על rbac_remove_member. ה-set_config עדיין קובע מי ה-owner לצורך auth.uid() בתוך
-- הפונקציה; זה לא תלוי ב-role.
begin;
select set_config('request.jwt.claim.sub', '<OWNER_USER_UUID>', true);
select public.rbac_remove_member('<WORKSPACE_ID>'::uuid, '<MEMBER_USER_UUID>'::uuid);
commit;
