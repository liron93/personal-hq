-- ============================================================================
-- RBAC RPC lockdown -- המשך ל-001_rbac_foundation.sql.  PROPOSED PATCH, NOT APPLIED.
-- Issue #7 (ממצא של עמית, Security Advisor על staging): צמצום משטח ה-RPC של ה-Data API.
--
-- שימוש: קובץ ה-follow-up הזה מיועד לסביבה שכבר יש עליה 001_rbac_foundation.sql הישן (staging
-- הקיים, שכבר הורץ עליו rollout/010-090) -- הוא עושה רק את ה-revoke-ים, בלי לגעת בטבלאות, ב-RLS,
-- בזריעה או בנתונים שכבר הועתקו. אפשר להריץ אותו כמה פעמים: revoke של הרשאה שלא קיימת הוא no-op
-- ב-Postgres, אז הוא idempotent. סדר ההרצה על staging: להריץ את זה *אחרי* 001+002+010-030 שכבר שם.
--
-- על סביבה חדשה (production, כשיאושר): אין צורך בקובץ הזה בנפרד. 001_rbac_foundation.sql המעודכן
-- כבר מכיל את אותה תוצאת grants מלכתחילה. שני הנתיבים (001 החדש; או 001 הישן + 001b) מגיעים לאותו
-- מצב סופי -- זה נבדק אמפירית (ראו הערת האימות בתחתית הקובץ).
--
-- למה בדיוק אלה, ולא אחרות: אותו הסבר שב-001_rbac_foundation.sql (חפשו "Issue #7" שם). בקצרה:
--  * has_capability, rbac_require_owner: לא נקראות משום policy ולא מה-Data API בפועל -- רק מתוך
--    גוף פונקציית SECURITY DEFINER אחרת באותה בעלות (can_access_state, וארבע פונקציות הניהול
--    בהתאמה), שרצה כבר תחת ה-DEFINER ולא בודקת EXECUTE נפרד של הקורא המקורי.
--  * rbac_approve_member / rbac_grant / rbac_revoke / rbac_remove_member: owner בלבד, בלי ראוט שרת
--    עדיין (docs/rbac/ROLLOUT.md) -- הבחירה הבטוחה היא לא RPC ללקוח בכלל, רק SQL Editor/service_role.
--    grep על lib/, companies/, app/ (כולל הענפים הפתוחים asaf/workspace-aware-app ו-
--    asaf/kesef-grocery-super) לא מצא אף קריאת supabase.rpc('rbac_...') מהלקוח.
--  * workspace_state_guard(): פונקציית טריגר בלבד; לא הייתה לה revoke/grant מפורש ב-001 המקורי,
--    כך שקיבלה EXECUTE ל-PUBLIC כברירת המחדל של Postgres -- חשיפה מיותרת, טריגר לא צריך אותה.
--  * is_workspace_owner / is_workspace_member / can_access_state נשארות בכוונה עם EXECUTE ל-
--    authenticated: מדיניות ה-RLS קוראת להן ישירות מתוך USING/WITH CHECK, וזה שובר RLS אם נשלל
--    (אומת אמפירית ב-PGlite -- "permission denied for function ..." על select פשוט).
--
-- אחרי ההרצה: rollout/030_approve_member.sql ו-rollout/040_remove_member.sql כבר עודכנו (לא עוברים
-- יותר ל-`set local role authenticated`) -- אם על staging יש עותק ישן של הסקריפטים האלה, יש להחליף
-- אותם בגרסה המעודכנת מהריפו לפני ההרצה הבאה שלהם, אחרת הם ייכשלו עם "permission denied".
-- ============================================================================

begin;

revoke execute on function
  public.has_capability(uuid, text),
  public.rbac_require_owner(uuid),
  public.rbac_approve_member(uuid, uuid, text),
  public.rbac_grant(uuid, uuid, text),
  public.rbac_revoke(uuid, uuid, text),
  public.rbac_remove_member(uuid, uuid)
  from authenticated;

revoke execute on function public.workspace_state_guard() from public, anon, authenticated;

-- ללא שינוי בכוונה (עדיין נדרשות ל-RLS): is_workspace_owner, is_workspace_member, can_access_state.

commit;
