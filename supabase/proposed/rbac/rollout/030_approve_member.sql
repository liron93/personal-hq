-- ה-owner מאשר חבר. הפונקציות דורשות auth.uid() = owner, ולכן מריצים אותן "בשם ה-owner" כך:
-- template לבחירה (זו נקודת ההחלטה על כספים, והיא הרשאה ולא קוד):
--   partner_full_finance       = אפשרות B (ההחלטה של לירון, ברירת המחדל לליאור): בית חדש + כל הכספים כולל תנועות וייבוא, קריאה בלבד
--   partner_full_finance_edit  = B+: B וגם עריכת תקציב ותנועות (רק באישור מפורש)
--   partner_budget_view        = אפשרות A: דשבורד/תקציב בלי תנועות גולמיות
--   partner_budget_edit        = A + עריכת תקציב
--   designer_beit_hadash  = מעצבת: בית חדש בלבד (וקבצי בית חדש), בלי HQ ובלי כספים
-- שדרוג/הורדה: approve מוסיף יכולות ולא מסיר. להורדה: קודם 040_remove_member ואז approve מחדש (מדויק לחבילה).
-- אחרי ההרצה: לבדוק allow/deny עם תבנית הבדיקה ב-docs/rbac/ROLLOUT.md.
begin;
select set_config('request.jwt.claim.sub', '<OWNER_USER_UUID>', true);
set local role authenticated;
select public.rbac_approve_member('<WORKSPACE_ID>'::uuid, '<MEMBER_USER_UUID>'::uuid, '<TEMPLATE>');
commit;
