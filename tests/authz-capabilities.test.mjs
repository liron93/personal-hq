import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const authz = await import("../lib/authz/capabilities.js");
const sql = await readFile(new URL("../supabase/proposed/rbac/001_rbac_foundation.sql", import.meta.url), "utf8");

// שולף את הטאפלים מבלוק SEED מסוים ב-SQL: ('a', 'b', 'c') -> ["a","b","c"]
const seed = name => {
  const block = sql.split(`-- BEGIN SEED ${name}`)[1]?.split(`-- END SEED ${name}`)[0] ?? "";
  return [...block.matchAll(/\(\s*'([^']+)'(?:\s*,\s*'([^']*)')?(?:\s*,\s*'([^']*)')?\s*\)/g)].map(m => [m[1], m[2], m[3]].filter(v => v !== undefined));
};

test("JS capability catalog is identical to the SQL seed", () => {
  const keys = seed("capabilities").map(r => r[0]);
  assert.deepEqual([...keys].sort(), [...authz.CAPABILITIES].sort());
});

test("JS company-key map is identical to the SQL seed", () => {
  const fromSql = Object.fromEntries(seed("company_capability_map").map(([key, read, write]) => [key, { read, write }]));
  assert.deepEqual(fromSql, authz.COMPANY_STATE_CAPABILITIES);
  for (const { read, write } of Object.values(authz.COMPANY_STATE_CAPABILITIES)) assert.ok(authz.CAPABILITIES.includes(read) && authz.CAPABILITIES.includes(write));
});

test("JS role templates are identical to the SQL seed", () => {
  const fromSql = {};
  for (const [role, cap] of seed("role_templates")) (fromSql[role] ??= []).push(cap);
  assert.deepEqual(Object.fromEntries(Object.entries(fromSql).map(([k, v]) => [k, [...v].sort()])), Object.fromEntries(Object.entries(authz.ROLE_TEMPLATES).map(([k, v]) => [k, [...v].sort()])));
  for (const caps of Object.values(authz.ROLE_TEMPLATES)) for (const c of caps) assert.ok(authz.CAPABILITIES.includes(c));
});

test("personal companies are never part of the shared workspace", () => {
  assert.deepEqual([...authz.PERSONAL_COMPANIES].sort(), ["avoda", "health", "nefesh"]);
  for (const personal of authz.PERSONAL_COMPANIES) assert.equal(personal in authz.SHARED_COMPANY_READ_CAPABILITY, false);
  const sharedKeys = Object.keys(authz.COMPANY_STATE_CAPABILITIES).join(" ");
  for (const banned of ["wellbeing", "health", "career"]) assert.equal(sharedKeys.includes(banned), false);
  for (const caps of Object.values(authz.ROLE_TEMPLATES)) for (const c of caps) assert.equal(/health|wellbeing|career|nefesh|avoda/.test(c), false, c);
});

test("B+ is the default for the partner (Liron, 21.9.2026: must be able to edit); B stays read-only; A differs as designed", () => {
  assert.equal(authz.DEFAULT_PARTNER_TEMPLATE, "partner_full_finance_edit");
  const b = authz.capabilitiesForTemplate("partner_full_finance");
  assert.equal(authz.financeLevel(b), "full");
  assert.equal(authz.canAccessStateKey(b, "hq:kesef:v1"), true);
  assert.equal(authz.canAccessStateKey(b, "hq:kesef-transactions:v1"), true);
  assert.equal(authz.canAccessStateKey(b, "hq:kesef:v1", { write: true }), false); // "רואה" = קריאה בלבד
  assert.equal(authz.canAccessStateKey(b, "hq:kesef-transactions:v1", { write: true }), false);
  assert.equal(authz.canAccessStateKey(b, "hq:beit-hadash:v2", { write: true }), true);
  const edit = authz.capabilitiesForTemplate("partner_full_finance_edit");
  assert.equal(authz.canAccessStateKey(edit, "hq:kesef-transactions:v1", { write: true }), true);
  assert.equal(authz.canAccessStateKey(edit, "hq:kesef:v1", { write: true }), true);
  const a = authz.capabilitiesForTemplate("partner_budget_view");
  assert.equal(authz.financeLevel(a), "dashboard_budget");
  assert.equal(authz.canAccessStateKey(a, "hq:kesef-transactions:v1"), false);
  const d = authz.capabilitiesForTemplate("designer_beit_hadash");
  assert.deepEqual(authz.visibleSharedCompanies(d), ["beit-hadash"]);
  assert.equal(authz.canViewHq(d), false);
  assert.equal(authz.financeLevel(d), "none");
  assert.deepEqual(authz.visibleSharedCompanies(b).sort(), ["beit-hadash", "kesef"]);
  assert.equal(authz.canViewHq(b), true);
});

test("owner gets everything, unknown keys are owner-only, and unknown templates throw", () => {
  assert.equal(authz.canAccessStateKey([], "hq:unmapped:v1", { isOwner: true, write: true }), true);
  assert.equal(authz.canAccessStateKey(authz.CAPABILITIES, "hq:unmapped:v1"), false); // גם עם כל היכולות: מפתח לא ממופה = owner בלבד
  assert.equal(authz.canAccessStateKey(authz.CAPABILITIES, "hq:wellbeing:v3"), false);
  assert.throws(() => authz.capabilitiesForTemplate("nope"));
  assert.equal(authz.can(undefined, "hq.view"), false);
});
