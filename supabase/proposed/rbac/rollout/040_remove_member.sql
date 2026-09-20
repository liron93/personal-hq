-- ביטול מיידי של כל הגישה של חבר במרחב (הנתונים שלו לא נמחקים; השורות נשמרות ל-audit).
begin;
select set_config('request.jwt.claim.sub', '<OWNER_USER_UUID>', true);
set local role authenticated;
select public.rbac_remove_member('<WORKSPACE_ID>'::uuid, '<MEMBER_USER_UUID>'::uuid);
commit;
