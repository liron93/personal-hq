import assert from "node:assert/strict";
import test from "node:test";

// בסיס סינתטי ל-staging הריק + בדיקות career_* ו-002 (idempotent / bucket קיים). PGlite אופציונלי: בלעדיו הבדיקות מדלגות.
// להרצה:  npm i --no-save @electric-sql/pglite   ואז   npm test
let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* לא מותקן */ }
const skip = PGlite ? false : "PGlite is not installed. Run: npm i --no-save @electric-sql/pglite";
const opts = { skip, timeout: 120_000 };
const runner = () => import("../supabase/tests/staging/staging-runner.mjs");
const fmt = f => f.map(x => `${x.name}: expected ${x.expected}, got ${x.actual}`);
const QUAL = "supabase/tests/staging/030_career_policy_qual_check.sql";

async function matrix(db) {
  const { read } = await runner();
  await db.exec(await read("supabase/tests/rbac_matrix.sql"));
  const { rows } = await db.query("select name, expected, actual from results");
  return { total: rows.length, failures: rows.filter(r => r.expected !== r.actual) };
}
const bucket = async db => (await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'home-documents'")).rows;

test("staging base: guard passes on empty project and refuses when not empty", opts, async () => {
  const { buildStaging, read } = await runner();
  const empty = new PGlite();
  await empty.exec((await import("../supabase/tests/rbac-runner.mjs")).SHIMS);
  await empty.exec(await read("supabase/tests/staging/000_guard_empty.sql"));
  const used = await buildStaging(PGlite, { upTo: 3 });
  await assert.rejects(used.exec(await read("supabase/tests/staging/000_guard_empty.sql")), /STAGING GUARD/);
});

test("staging base: full sequence + RBAC matrix pass, 002 run twice", opts, async () => {
  const { buildStaging } = await runner();
  const db = await buildStaging(PGlite, { secondRun002: true });
  const { total, failures } = await matrix(db);
  assert.ok(total >= 300);
  assert.deepEqual(fmt(failures), []);
  const [b] = await bucket(db);
  assert.equal(b.public, false);
  assert.equal(Number(b.file_size_limit), 26214400);
  assert.equal(b.allowed_mime_types.length, 7);
  const pol = await db.query("select count(*)::int as n from pg_policies where schemaname='storage' and policyname like 'home_documents_%'");
  assert.equal(pol.rows[0].n, 4);
});

test("002 hardens a pre-existing private bucket with no limits (production shape), twice, and the matrix still passes", opts, async () => {
  const { buildStaging } = await runner();
  const pre = `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('home-documents', 'home-documents', false, null, null);
               insert into storage.objects (bucket_id, name, metadata) values ('home-documents', 'legacy/old.txt', '{"mimetype":"text/plain"}');`;
  const db = await buildStaging(PGlite, { preSql: pre, secondRun002: true });
  const [b] = await bucket(db);
  assert.equal(b.public, false);
  assert.equal(Number(b.file_size_limit), 26214400);
  assert.ok(b.allowed_mime_types.includes("application/pdf") && !b.allowed_mime_types.includes("text/plain"));
  assert.equal((await db.query("select count(*)::int as n from storage.objects where name = 'legacy/old.txt'")).rows[0].n, 1, "existing objects are not deleted");
  assert.equal((await db.query("select count(*)::int as n from storage.buckets where id = 'home-documents'")).rows[0].n, 1);
  assert.deepEqual(fmt((await matrix(db)).failures), []);
});

test("002 flips a public pre-existing bucket to private and tolerates an extra broad policy (reported as warning, not deleted)", opts, async () => {
  const { buildStaging } = await runner();
  const pre = `insert into storage.buckets (id, name, public) values ('home-documents', 'home-documents', true);
               create policy legacy_read on storage.objects for select to authenticated using (bucket_id = 'home-documents');`;
  const db = await buildStaging(PGlite, { preSql: pre, secondRun002: true });
  assert.equal((await bucket(db))[0].public, false);
  assert.equal((await db.query("select count(*)::int as n from pg_policies where policyname = 'legacy_read'")).rows[0].n, 1, "002 must not silently drop unknown policies");
});

test("career_jobs / career_communications: real policy qual is owner-only (read-only check) and functional deny holds", opts, async () => {
  const { buildStaging, runCheck } = await runner();
  const db = await buildStaging(PGlite);
  const q = await runCheck(db, QUAL, "qual_results");
  assert.ok(q.total >= 18);
  assert.deepEqual(fmt(q.failures), []);
  const f = await runCheck(db, "supabase/tests/staging/031_career_owner_only_functional.sql", "func_results");
  assert.ok(f.total >= 12);
  assert.deepEqual(fmt(f.failures), []);
});

test("qual check catches a non-owner-only policy, an anon role, a missing table and a disabled RLS", opts, async () => {
  const { buildStaging, runCheck } = await runner();
  for (const [label, mutate, expectFail] of [
    ["using(true)", "drop policy career_jobs_owner on public.career_jobs; create policy p on public.career_jobs for all to authenticated using (true) with check (true)", "career_jobs"],
    ["workspace member", "drop policy career_communications_owner on public.career_communications; create policy p on public.career_communications for all to authenticated using (auth.uid() = user_id or public.is_workspace_member('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')) with check (auth.uid() = user_id)", "career_communications"],
    ["select for anon", "create policy p on public.career_jobs for select to anon using (auth.uid() = user_id)", "career_jobs"],
    ["rls off", "alter table public.career_communications disable row level security", "career_communications"],
    ["insert with_check true", "drop policy career_jobs_owner on public.career_jobs; create policy p1 on public.career_jobs for select to authenticated using ((select auth.uid()) = user_id); create policy p2 on public.career_jobs for insert to authenticated with check (true); create policy p3 on public.career_jobs for update to authenticated using ((select auth.uid()) = user_id); create policy p4 on public.career_jobs for delete to authenticated using ((select auth.uid()) = user_id)", "career_jobs"],
  ]) {
    const db = await buildStaging(PGlite);
    await db.exec(mutate);
    const { failures } = await runCheck(db, QUAL, "qual_results");
    assert.ok(failures.some(x => x.name.startsWith(expectFail)), `${label}: expected the check to fail on ${expectFail}`);
  }
  const db = await buildStaging(PGlite);
  await db.exec("drop table public.career_communications");
  const { failures } = await runCheck(db, QUAL, "qual_results");
  assert.ok(failures.some(x => x.name === "career_communications: table exists"));
});

test("anon grants preflight is read-only and lists anon grants (nothing revoked)", opts, async () => {
  const { buildStaging, anonGrants } = await runner();
  const db = await buildStaging(PGlite);
  const count = async () => (await db.query("select count(*)::int as n from pg_class c cross join lateral aclexplode(c.relacl) a join pg_roles r on r.oid = a.grantee where r.rolname = 'anon'")).rows[0].n;
  const before = await count();
  const [tables, , defaults] = await anonGrants(db);
  const names = tables.map(t => t.object);
  assert.ok(names.includes("company_state") && names.includes("career_jobs"), "default Supabase grants to anon are listed");
  assert.ok(defaults.length >= 1);
  assert.equal(await count(), before);
});
