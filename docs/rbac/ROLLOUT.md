# RBAC: הפעלה והחזרה (קצר)

**לא להריץ שום דבר מכאן על production בלי review של עמית ואישור מפורש של לירון.** אני לא מריץ את זה.
הסקריפטים ב-`supabase/proposed/rbac/`. מזהים אמיתיים (משתמשים, מרחב) מוחלפים רק בעותק פרטי, לעולם לא בריפו או ב-Issue.

## לפני הכול (בדיקה)
1. הרץ את המטריצה על **Supabase branch/פרויקט בדיקה** (לא production): `rbac_matrix.sql`. כל השורות ב-`results` חייבות להיות `expected = actual`.
2. הרץ `rollout/000_preflight_checks.sql` על ה-DB החי (קריאה בלבד). בדוק: אין טבלה בלי RLS; ל-`career_jobs` ול-`career_communications` יש RLS של `user_id = auth.uid()` לכל פעולה; אין policies עם `using (true)` בטעות; ל-anon אין הרשאות; ב-Dashboard שההרשמה החופשית כבויה.
3. ה-PR של האפליקציה (`store.js` לפי מרחב, הפרדת ה-cache המקומי לפי משתמש, הצגה לפי יכולות) חייב להיות ממוזג ובדוק **לפני** שליאור מקבלת גישה. ראה DESIGN.

## הפעלה (owner, ב-SQL Editor, בסדר הזה)
| # | סקריפט | מה עושה | חוזר אחורה ב |
|---|---|---|---|
| 1 | `001_rbac_foundation.sql` | טבלאות הרשאות, פונקציות, RLS, זריעה | `001_..down.sql` |
| 2 | `002_home_documents_storage.sql` | bucket וקבצים משותפים | `002_..down.sql` |
| 3 | `rollout/010_create_home_workspace.sql` | יוצר את "בית משותף" (מחזיר `<WORKSPACE_ID>`) | מחיקת השורה ב-`workspaces` |
| 4 | `rollout/020_copy_shared_state.sql` | **מעתיק** בית חדש / כספים / ליבה למרחב. המקור לא נוגע. idempotent | `rollout/090_revert_copy.sql` |
| 5 | `rollout/030_approve_member.sql` | מאשר חבר לפי חבילה | `rollout/040_remove_member.sql` |

בחירת החבילה בשלב 5 היא ההחלטה על כספים: `partner_budget_view` (A, ברירת מחדל), `partner_budget_edit` (A+), `partner_full_finance` (B), `designer_beit_hadash` (שקד).
בריאות, נפשי וקריירה **לא** מועתקים ולא משותפים לעולם.

## אימות אחרי כל אישור (allow/deny עם החשבון האמיתי)
* ליאור (חבילה A): רואה בית חדש וקבצי בית חדש. רואה דשבורד/תקציב **בקריאה בלבד**. לא רואה תנועות, נפשי, בריאות, קריירה של לירון. הקריירה שלה ריקה.
* שקד: רואה **רק** בית חדש. לא רואה HQ, כספים, נפשי, בריאות, קריירה.
* משתמש שלא אושר: מרחב אישי ריק בלבד.
* `select action, target_user, capability, at from permission_audit order by at desc;` מציג כל שינוי (בפרט: מי אישר מה).

## שינוי רמת גישה
* **העלאה** (A ל-A+ או ל-B): להריץ `030` עם החבילה הגבוהה יותר. approve **מוסיף** יכולות.
* **הורדה** (B ל-A): `040_remove_member` ואז `030` עם החבילה הרצויה. זה מדויק לחבילה ולא משאיר יכולות ישנות.

## החזרה מיידית (חירום)
1. **לסגור גישה למשתמש:** `rollout/040_remove_member.sql`. פועל מיד (נבדק). הנתונים שלו לא נמחקים.
2. **לבטל את ההעתקה:** `rollout/090_revert_copy.sql`. המקור ב-`company_state` שלם, והאפליקציה חוזרת לקרוא ממנו.
3. **להסיר את כל המנגנון:** `002_..down.sql` ואז `001_..down.sql` (סדר חשוב). לא נוגעים ב-`company_state`, ב-`career_*` או ב-`career-documents`. אם כבר הועלו קבצים ל-`home-documents`, ה-bucket לא יימחק אוטומטית (Supabase לא מאפשר). מייצאים/מוחקים אותם קודם ב-Dashboard. מעגל up, down, up נבדק.

## מה נשאר בעדיפות אחרי המסירה
מחזור בדיקות על Supabase branch, סקירה של `permission_audit`, והחלטה אם לפצל את `hq:kesef:v1` כך שנכסים/מעקב מניות לא יחשפו בחבילה A.
