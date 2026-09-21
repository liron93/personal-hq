// מריץ את מטריצת ה-RBAC על Postgres אמיתי בתוך Node (PGlite), בלי Supabase ובלי רשת.
// שימוש (חד-פעמי, בלי לשנות package.json):   npm i --no-save @electric-sql/pglite   ואז   node supabase/tests/rbac-runner.mjs
// מה הוא עושה: מדמה את מה ש-Supabase נותן (תפקידים anon/authenticated, סכמת auth, storage, ברירות מחדל של הרשאות),
// מריץ את הקבצים האמיתיים של הריפו (schema.sql + מיגרציות הקריירה), אחר כך את ה-patch המוצע, ואז את המטריצה.
// הדמיות (shims) הן רק לצורך הבדיקה. **career_jobs ו-career_communications אינן בשום migration בריפו**: הן stand-in (supabase/tests/staging/010) עם אותה policy
// שהקוד מצפה לה. יש לוודא מול ה-DB החי (rollout/000_preflight_checks.sql) שה-RLS האמיתי שלה זהה.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const read = p => readFile(new URL(p, root), "utf8");

export const SHIMS = `
  create role authenticated nologin; create role anon nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid, owner_id text, metadata jsonb);
  alter table storage.objects enable row level security;
  -- כמו ההגדרה של Supabase: מחזירה את התיקיות בלבד, בלי שם הקובץ האחרון בנתיב.
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant execute on function storage.foldername(text) to anon, authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant select on storage.buckets to authenticated;
  -- Supabase נותן כברירת מחדל הרשאות מלאות על כל טבלה חדשה ב-public; ה-RLS הוא שמגן. מדמים את זה כדי שה-revoke שב-patch יבחן באמת.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

/** בונה DB נקי עם הכול חוץ מה-patch של RBAC. */
export async function buildBase(PGlite) {
  const db = new PGlite();
  await db.exec(SHIMS);
  await db.exec(await read("supabase/schema.sql"));
  // career_jobs / career_communications אינן ב-migration: stand-in סינתטי משותף עם בסיס ה-staging.
  await db.exec(await read("supabase/tests/staging/010_synthetic_career_base.sql"));
  await db.exec(await read("supabase/migrations/202609120001_career_foundation.sql"));
  await db.exec(await read("supabase/migrations/202609120002_career_learning_and_interviews.sql"));
  return db;
}

export async function runRbacMatrix(PGlite, { files = ["supabase/proposed/rbac/001_rbac_foundation.sql", "supabase/proposed/rbac/002_home_documents_storage.sql"], matrix = "supabase/tests/rbac_matrix.sql" } = {}) {
  const db = await buildBase(PGlite);
  for (const f of files) await db.exec(await read(f));
  await db.exec(await read(matrix));
  const { rows } = await db.query("select name, expected, actual from results order by name");
  const failures = rows.filter(r => r.expected !== r.actual);
  return { db, total: rows.length, failures, rows };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { total, failures } = await runRbacMatrix(PGlite);
  console.log(`RBAC matrix: ${total - failures.length}/${total} passed`);
  for (const f of failures) console.log(`  FAIL  ${f.name}\n        expected=${f.expected}  actual=${f.actual}`);
  process.exit(failures.length ? 1 : 0);
}
