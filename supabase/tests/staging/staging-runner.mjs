// מריץ על PGlite (Postgres בתוך Node, בלי רשת ובלי Supabase) את אותו רצף בדיוק שמריצים ידנית ב-staging הריק:
//   000 guard -> schema.sql -> 010 בסיס סינתטי -> migrations הקריירה -> 001 -> 002 (פעמיים) -> מטריצה -> 030/031 -> 020.
// הכול סינתטי. שימוש:   npm i --no-save @electric-sql/pglite   ואז   node supabase/tests/staging/staging-runner.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SHIMS } from "../rbac-runner.mjs";

const root = new URL("../../../", import.meta.url);
export const read = p => readFile(new URL(p, root), "utf8");

export const ORDER = [
  "supabase/tests/staging/000_guard_empty.sql",
  "supabase/schema.sql",
  "supabase/tests/staging/010_synthetic_career_base.sql",
  "supabase/migrations/202609120001_career_foundation.sql",
  "supabase/migrations/202609120002_career_learning_and_interviews.sql",
  "supabase/proposed/rbac/001_rbac_foundation.sql",
  "supabase/proposed/rbac/002_home_documents_storage.sql",
];

/** מחקה פרויקט Supabase ריק: תפקידים, auth, storage (SHIMS) ואז רצף ה-staging. preSql רץ לפני 001 (למשל bucket שכבר קיים). */
export async function buildStaging(PGlite, { preSql = "", secondRun002 = false, upTo = ORDER.length } = {}) {
  const db = new PGlite();
  await db.exec(SHIMS);
  for (const [i, f] of ORDER.slice(0, upTo).entries()) {
    if (f.endsWith("001_rbac_foundation.sql") && preSql) await db.exec(preSql);
    await db.exec(await read(f));
    if (secondRun002 && f.endsWith("002_home_documents_storage.sql")) await db.exec(await read(f));
  }
  return db;
}

/** מריץ קובץ שמחזיר טבלת temp של תוצאות ומחזיר את השורות הכושלות. */
export async function runCheck(db, file, table) {
  await db.exec(await read(file));
  const { rows } = await db.query(`select name, expected, actual from ${table} order by name`);
  return { total: rows.length, failures: rows.filter(r => r.expected !== r.actual) };
}

export async function anonGrants(db) {
  const sql = await read("supabase/tests/staging/020_anon_grants_preflight.sql");
  const res = await db.exec(sql);
  return res.map(r => r.rows);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { runRbacMatrix } = await import("../rbac-runner.mjs");
  let bad = 0;
  const db = await buildStaging(PGlite, { secondRun002: true });
  for (const [file, table] of [["supabase/tests/staging/030_career_policy_qual_check.sql", "qual_results"], ["supabase/tests/staging/031_career_owner_only_functional.sql", "func_results"]]) {
    const { total, failures } = await runCheck(db, file, table);
    console.log(`${file.split("/").pop()}: ${total - failures.length}/${total}`);
    for (const f of failures) console.log(`  FAIL ${f.name}: expected=${f.expected} actual=${f.actual}`);
    bad += failures.length;
  }
  const m = await db.exec(await read("supabase/tests/rbac_matrix.sql"));
  const { rows } = await db.query("select name, expected, actual from results");
  const mf = rows.filter(r => r.expected !== r.actual);
  console.log(`rbac_matrix on staging base: ${rows.length - mf.length}/${rows.length}`);
  for (const f of mf) console.log(`  FAIL ${f.name}: expected=${f.expected} actual=${f.actual}`);
  bad += mf.length;
  const [tables] = await anonGrants(db);
  console.log(`anon grants on public tables (informational, nothing revoked): ${tables.length}`);
  process.exit(bad ? 1 : 0);
}
