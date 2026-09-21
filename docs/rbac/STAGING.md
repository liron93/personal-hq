# RBAC: הרצת המטריצה על staging ריק (`personal-hq-staging`)

**בדיקה בלבד. הכול סינתטי: בלי dump, בלי העתקה ובלי נתונים אמיתיים. לא מריצים שום דבר מכאן על production.**
הקבצים ב-`supabase/tests/staging/`. `auth` ו-`storage` כבר קיימים ב-Supabase האמיתי ולא נוצרים.

## הרצה ב-SQL Editor של staging (בסדר הזה)
| # | קובץ | מה עושה |
|---|---|---|
| 0 | `staging/000_guard_empty.sql` | מסרב אם יש טבלאות ב-`public` או משתמשים (הגנה מהרצה בטעות על production) |
| 1 | `supabase/schema.sql` | `company_state` |
| 2 | `staging/010_synthetic_career_base.sql` | stand-in ל-`career_jobs` ו-`career_communications` (אינן ב-migration בריפו) |
| 3 | `migrations/202609120001_career_foundation.sql`, `...0002_career_learning_and_interviews.sql` | טבלאות הקריירה + bucket `career-documents` |
| 4 | `proposed/rbac/001_rbac_foundation.sql`, `002_home_documents_storage.sql` | ה-patch הנבדק |
| 5 | `supabase/tests/rbac_matrix.sql` | המטריצה. כל שורה ב-`results` חייבת `expected = actual` |
| 6 | `staging/030_career_policy_qual_check.sql`, `031_career_owner_only_functional.sql` | owner-only ל-career (ראה למטה). הפלט מציג רק כשלים: ריק = עבר |

אחרי כל ריצה ב-staging אפשר לאפס ע"י מחיקת הפרויקט/`reset`; המטריצה משאירה משתמשי דמו ב-`auth.users`.

## בדיקת ה-`qual` של `career_jobs` / `career_communications`
* `030_career_policy_qual_check.sql`: **קריאה בלבד** (רק `pg_policies`/`pg_class`), **בטוח גם על production**. דורש: RLS פעיל, ארבע הפעולות מכוסות, ל-`authenticated` בלבד, ו-`qual`/`with_check` שווים ל-`auth.uid() = user_id` (הנרמול מקבל גם `(select auth.uid())`). `using (true)`, `or ...`, או policy ל-anon נכשלים.
* `031_..._functional.sql`: כותב משתמשי דמו ומבטל הכול, **staging בלבד** (מסרב אם יש משתמש לא-דמו).
* מול production: הריצו רק את `030` ואת `020` (קריאה בלבד). בסיס ה-staging הוא stand-in, ולכן התוצאה האמיתית היא זו של `030` על ה-DB החי.

## `anon` (ממצא, לא מתקנים כאן)
`staging/020_anon_grants_preflight.sql` הוא קריאה בלבד: מפרט הרשאות מפורשות של `anon` על טבלאות/פונקציות ב-`public` וברירות מחדל עתידיות. **אין revoke.** כל שורה עם `rls_enabled = false` היא ממצא חמור; שאר השורות מוגנות ע"י RLS, וההחלטה אם להוריד הרשאות שייכת לעמית בנפרד.

## `002` ו-bucket שכבר קיים ב-production
`home-documents` קיים שם (פרטי, בלי מגבלות). `002` הוא idempotent (`create or replace`, `drop policy if exists`, upsert ל-bucket): מקשיח במכוון ל-private + 25MB + 7 סוגי קבצים, ומדפיס `NOTICE` עם המצב הקודם, כמה אובייקטים קיימים מחוץ לרשימת הסוגים (לא נמחקים, ההגבלה חלה על העלאות חדשות), ו-`WARNING` אם יש policies אחרות על `storage.objects` שמזכירות את ה-bucket (הן מתווספות ב-OR ולכן צריך לבדוק אותן ידנית לפני הפעלה).

## אימות מקומי (בלי Supabase)
```
npm i --no-save @electric-sql/pglite
node supabase/tests/staging/staging-runner.mjs    # אותו רצף על PGlite
npm test                                          # כולל tests/staging-schema-base.test.mjs
```
הבדיקות מכסות: guard, רצף מלא + מטריצה (377), `002` פעמיים, bucket קיים (private בלי מגבלות; public), policy זרה, ובדיקה שה-qual-check אכן נכשל על policy רחבה.
