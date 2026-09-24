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

בחירת החבילה בשלב 5 היא ההחלטה על כספים. **לליאור: `partner_full_finance` (B, החלטת לירון 21.9.2026: רואה את כל הכספים כולל תנועות, קריאה בלבד).** אפשרויות נוספות: `partner_full_finance_edit` (B+, גם עריכה), `partner_budget_view` (A), `partner_budget_edit` (A+). לשקד: `designer_beit_hadash`.
בריאות, נפשי וקריירה **לא** מועתקים ולא משותפים לעולם.

## עדכון אבטחה (Issue #7): נעילת ה-RPC של פונקציות עזר וניהול

עמית מצא ב-Security Advisor של staging ש-10 פונקציות SECURITY DEFINER קיבלו EXECUTE ל-`authenticated`
(ומכאן קריאות דרך ה-Data API, `POST /rest/v1/rpc/<שם>`) -- גם פונקציות עזר פנימיות
(`is_workspace_owner`, `is_workspace_member`, `has_capability`, `can_access_state`, `rbac_require_owner`)
וגם פונקציות ניהול (`rbac_approve_member`, `rbac_grant`, `rbac_revoke`, `rbac_remove_member`). הבדיקה
הפנימית בפונקציות הניהול (owner בלבד) עדיין מגנה על הפעולה, אבל צמצמנו את משטח ה-RPC לפני production:

* **`is_workspace_owner`, `is_workspace_member`, `can_access_state`** -- נשארות עם EXECUTE ל-`authenticated`.
  חובה: מדיניות ה-RLS קוראת להן ישירות מתוך ה-policies, ואומת אמפירית ב-PGlite ש-revoke עליהן שובר
  select רגיל על `workspaces`/`workspace_state` ("permission denied for function").
* **`has_capability`, `rbac_require_owner`** -- EXECUTE נשלל מ-`authenticated`. הן נקראות רק מתוך גוף
  פונקציה אחרת (לא RPC ישיר, ולא מדיניות RLS), אז אין בכך צורך, ואומת שזה לא שובר אף בדיקה.
* **ארבע פונקציות הניהול** (`rbac_approve_member`/`rbac_grant`/`rbac_revoke`/`rbac_remove_member`) --
  EXECUTE נשלל מ-`authenticated` לגמרי. אין עדיין ראוט שרת ייעודי, אז הן זמינות **רק** דרך SQL Editor
  (כפי שכבר מתואר למעלה) -- זהו בדיוק תהליך העבודה הקיים, ולא משתנה בפועל. ה-grep על קוד האפליקציה
  (כולל הענפים הפתוחים `asaf/workspace-aware-app` ו-`asaf/kesef-grocery-super`) לא מצא אף קריאת
  `supabase.rpc('rbac_...')` מהלקוח.
* **`workspace_state_guard`** (טריגר) -- לא היה לה revoke/grant מפורש ב-`001` המקורי (חשיפה ל-PUBLIC
  כברירת המחדל של Postgres). נשללה עכשיו לגמרי; טריגר לא צריך EXECUTE ישיר כדי לפעול.

### מה בדיוק להריץ על ה-staging הקיים (שכבר יש עליו `001`+`002`+`rollout/010-030`)

**לא** להריץ down+up מלא. מספיק סקריפט הנעילה החדש, שהוא revoke-בלבד ואידמפוטנטי (אפשר להריץ כמה
פעמים בלי נזק):

```
supabase/proposed/rbac/001b_rbac_rpc_lockdown.sql
```

להריץ ב-SQL Editor כ-owner, בדיוק כמו `001`/`002`. אחריו: `002` לא צריך שינוי, וגם `rollout/010`-`020`
(מרחב + העתקת מצב) לא צריכים לרוץ שוב -- הם כבר רצו. אם עמית ירצה להריץ שוב `rollout/030_approve_member.sql`
או `rollout/040_remove_member.sql` (למשל כדי לאשר את ליאור/שקד מחדש), חשוב לקחת את הגרסה המעודכנת
מהריפו: היא כבר לא עוברת ל-`set local role authenticated` (כי אחרי הנעילה לתפקיד הזה אין יותר EXECUTE
על הפונקציות, אז הגרסה הישנה של 030/040 תיכשל עם "permission denied").

אחרי ההרצה: להריץ שוב Security Advisor על ה-staging project ולוודא שה-10 אזהרות נעלמו (או שנשארה רק
האזהרה על שלוש הפונקציות שבכוונה נשארות RPC-accessible -- `is_workspace_owner`/`is_workspace_member`/
`can_access_state` -- ואם Advisor עדיין מסמן אותן, זו אזהרה ידועה ומוצדקת: הן חייבות EXECUTE כדי ש-RLS
יעבוד, ראו ההסבר למעלה ובקובץ `001b_rbac_rpc_lockdown.sql` עצמו).

נבדק: PGlite עם `001` הישן (staging) + `002` + `001b` מגיע לאותו מצב הרשאות בדיוק כמו `001` המעודכן
לבד -- כל 431 הבדיקות ב-`rbac_matrix.sql` (377 המקוריות + 54 בדיקות הרשאה/נעילה חדשות) עוברות בשני
הנתיבים.

## אימות אחרי כל אישור (allow/deny עם החשבון האמיתי)
* ליאור (חבילה B): רואה בית חדש וקבצי בית חדש, ואת כל הכספים **כולל תנועות**, בקריאה בלבד (אין עריכה בכספים). לא רואה נפשי, בריאות, קריירה של לירון. הקריירה שלה ריקה.
* שקד: רואה **רק** בית חדש. לא רואה HQ, כספים, נפשי, בריאות, קריירה.
* משתמש שלא אושר: מרחב אישי ריק בלבד.
* `select action, target_user, capability, at from permission_audit order by at desc;` מציג כל שינוי (בפרט: מי אישר מה).

## שינוי רמת גישה
* **העלאה** (למשל B ל-B+): להריץ `030` עם החבילה הגבוהה יותר. approve **מוסיף** יכולות.
* **הורדה** (למשל B+ ל-B): `040_remove_member` ואז `030` עם החבילה הרצויה. זה מדויק לחבילה ולא משאיר יכולות ישנות.

## החזרה מיידית (חירום)
1. **לסגור גישה למשתמש:** `rollout/040_remove_member.sql`. פועל מיד (נבדק). הנתונים שלו לא נמחקים.
2. **לבטל את ההעתקה:** `rollout/090_revert_copy.sql`. המקור ב-`company_state` שלם, והאפליקציה חוזרת לקרוא ממנו.
3. **להסיר את כל המנגנון:** `002_..down.sql` ואז `001_..down.sql` (סדר חשוב). לא נוגעים ב-`company_state`, ב-`career_*` או ב-`career-documents`. אם כבר הועלו קבצים ל-`home-documents`, ה-bucket לא יימחק אוטומטית (Supabase לא מאפשר). מייצאים/מוחקים אותם קודם ב-Dashboard. מעגל up, down, up נבדק.

## מה נשאר בעדיפות אחרי המסירה
מחזור בדיקות על Supabase branch, סקירה של `permission_audit`, והחלטה אם לפצל את `hq:kesef:v1` כך שנכסים/מעקב מניות לא יחשפו בחבילה A.
