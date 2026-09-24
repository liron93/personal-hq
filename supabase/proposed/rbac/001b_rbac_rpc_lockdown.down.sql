-- החזרה לאחור של 001b_rbac_rpc_lockdown.sql בלבד: מחזיר את ה-EXECUTE ל-authenticated על הפונקציות
-- שהקובץ ההוא שלל, בלי לגעת בטבלאות, ב-RLS או בנתונים. לא מיועד לשימוש רגיל -- ה-lockdown הוא
-- התיקון של Issue #7; יש להשתמש בזה רק לצורך חירום/דיבוג, ולא להשאיר ב-production.
-- (אם ממילא מריצים את 001_rbac_foundation.down.sql, הוא מוחק את הפונקציות עצמן ומייתר את זה.)

begin;

grant execute on function
  public.has_capability(uuid, text),
  public.rbac_require_owner(uuid),
  public.rbac_approve_member(uuid, uuid, text),
  public.rbac_grant(uuid, uuid, text),
  public.rbac_revoke(uuid, uuid, text),
  public.rbac_remove_member(uuid, uuid)
  to authenticated;

commit;
