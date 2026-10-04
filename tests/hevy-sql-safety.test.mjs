// בדיקה סטטית (לא מריצה SQL אמיתי - אין DB בסביבת הבדיקות) על
// supabase/proposed/health/001_hevy_connection.sql: מוודאת שהקובץ עצמו, כטקסט, שומר על
// העיקרון שסוכם עם עמית ב-Issue #7 - הטבלה נגישה אך ורק ל-service-role, לעולם לא ל-
// anon/authenticated, גם לא דרך policy "קריאת השורה של עצמי" שנראה תמים. אם מישהו יוסיף
// בעתיד create policy/grant לטבלה הזו בלי לשים לב - הבדיקה הזו נכשלת ותופסת את זה.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(here, "../supabase/proposed/health/001_hevy_connection.sql"), "utf8");
const lower = sql.toLowerCase();

test("001_hevy_connection.sql: אין אף create policy על הטבלה - deny-by-default מוחלט", () => {
  assert.doesNotMatch(lower, /create\s+policy/);
});

test("001_hevy_connection.sql: RLS מופעל על הטבלה", () => {
  assert.match(lower, /enable row level security/);
});

test("001_hevy_connection.sql: שולל במפורש הרשאות anon/authenticated (revoke all)", () => {
  assert.match(lower, /revoke all on table public\.health_hevy_connection from anon, authenticated/);
});

test("001_hevy_connection.sql: אין אף grant ל-anon/authenticated על הטבלה הזו", () => {
  const grantToClientRoles = /grant\s[^;]*health_hevy_connection[^;]*\bto\s+(anon|authenticated)\b/;
  assert.doesNotMatch(lower, grantToClientRoles);
});

test("001_hevy_connection.sql: עטוף ב-begin/commit (אפשר להריץ/לבטל בבת אחת)", () => {
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
});
