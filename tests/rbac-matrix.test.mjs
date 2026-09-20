import assert from "node:assert/strict";
import test from "node:test";

// מריץ את מטריצת ה-allow/deny ואת סקריפטי ההפעלה/החזרה על Postgres אמיתי בתוך Node (PGlite).
// PGlite אינו תלות של הפרויקט (כבד ושייך לבדיקה בלבד), לכן הבדיקה מדלגת כשהוא לא מותקן.
// להרצה:  npm i --no-save @electric-sql/pglite   ואז   npm test
let PGlite = null;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { /* לא מותקן */ }
const skip = PGlite ? false : "PGlite is not installed. Run: npm i --no-save @electric-sql/pglite";

test("RBAC allow/deny matrix passes on real Postgres", { skip, timeout: 120_000 }, async () => {
  const { runRbacMatrix } = await import("../supabase/tests/rbac-runner.mjs");
  const { total, failures } = await runRbacMatrix(PGlite);
  assert.ok(total >= 300, `expected a full matrix, got ${total} checks`);
  assert.deepEqual(failures.map(f => `${f.name}: expected ${f.expected}, got ${f.actual}`), []);
});

test("RBAC rollout, revert and up/down round trip pass on real Postgres", { skip, timeout: 120_000 }, async () => {
  const { runRolloutChecks } = await import("../supabase/tests/rbac-rollout.mjs");
  const results = await runRolloutChecks(PGlite);
  assert.ok(results.length >= 14);
  assert.deepEqual(results.filter(r => !r.ok).map(r => `${r.name} ${r.detail}`), []);
});
