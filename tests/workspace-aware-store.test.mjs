import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "placeholder-anon-key";

const ls = new Map();
globalThis.window = { localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); }, removeItem: k => { ls.delete(k); } } };

const { loadStateWithClient, loadWithClient, saveWithClient, localKey } = await import("../lib/store.js");
const { resolveAccess, visibleCompanySlugs, isCompanyReadOnly, isHqVisible, canViewCompany, isMissingRelation } = await import("../lib/workspace.js");
const { capabilitiesForTemplate, DEFAULT_PARTNER_TEMPLATE } = await import("../lib/authz/capabilities.js");
const { buildJarvisContext } = await import("../lib/jarvis-context.js");
const { isEditControl, applyReadOnly, READONLY_TITLE } = await import("../lib/readonly-dom.js");

// כל המזהים כאן בדויים.
const WS = "ws-shared-1";
const OWNER = "user-owner", PARTNER = "user-partner", DESIGNER = "user-designer", STRANGER = "user-stranger";
const SLUGS = ["beit-hadash", "kesef", "health", "avoda", "nefesh"];

/** מסד מזויף בזיכרון. rbac:false = הטבלאות לא קיימות (PGRST205), כמו לפני הפריסה. hasWorkspace:false = אין עדיין מרחב משותף. */
function fakeDb({ rbac = true, members = {}, workspaceOwner = OWNER, failWorkspaces = false, hasWorkspace = true } = {}) {
  const tables = { company_state: new Map() };
  const ws = new Map(); // workspace_state: "<ws>|<key>" -> { data, at }
  let tick = 0;
  const calls = [];
  const flags = { failWorkspaces, hang: false, failCaps: false };
  const putWs = (key, data) => ws.set(`${WS}|${key}`, { data, at: `t${++tick}` }); // כתיבה של "מישהו אחר"
  const wsData = key => ws.get(`${WS}|${key}`)?.data;
  const client = uid => ({
    auth: { getSession: async () => ({ data: { session: uid ? { user: { id: uid } } : null } }) },
    from(table) {
      calls.push({ table });
      return {
        select() {
          const f = {};
          const q = {
            eq(c, v) { f[c] = v; return q; },
            limit() { return q; },
            async maybeSingle() {
              calls.push({ table, op: "read", f: { ...f } });
              if (table === "company_state") { const r = tables.company_state.get(`${f.user_id}|${f.company_key}`); return { data: r === undefined ? null : { data: r }, error: null }; }
              if (table === "workspace_state") { const r = ws.get(`${f.workspace_id}|${f.company_key}`); return { data: r ? { data: r.data, updated_at: r.at } : null, error: null }; }
              return { data: null, error: null };
            },
            then(res, rej) {
              if (!rbac) return Promise.resolve({ data: null, error: { code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` } }).then(res, rej);
              if (flags.hang && table === "workspaces") return new Promise(() => {});
              if (flags.failCaps && table === "member_capabilities") return Promise.resolve({ data: null, error: { message: "fetch failed" } }).then(res, rej);
              if (flags.failWorkspaces) return Promise.resolve({ data: null, error: { message: "fetch failed" } }).then(res, rej);
              if (table === "workspaces") { const m = members[uid]; return Promise.resolve({ data: hasWorkspace && (m || uid === workspaceOwner) ? [{ id: WS, owner_id: workspaceOwner }] : [], error: null }).then(res, rej); }
              if (table === "member_capabilities") return Promise.resolve({ data: (members[uid]?.caps || []).map(([capability, revoked_at]) => ({ capability, revoked_at: revoked_at || null })), error: null }).then(res, rej);
              return Promise.resolve({ data: [], error: null }).then(res, rej);
            },
          };
          return q;
        },
        insert(row) {
          calls.push({ table, op: "write", kind: "insert", row });
          const k = `${row.workspace_id}|${row.company_key}`;
          const exists = ws.has(k);
          if (!exists) ws.set(k, { data: row.data, at: `t${++tick}` });
          return { select: () => ({ maybeSingle: async () => exists ? { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } } : { data: { updated_at: ws.get(k).at }, error: null } }) };
        },
        update(patch) {
          const f = {};
          const q = {
            eq(c, v) { f[c] = v; return q; },
            select: async () => {
              calls.push({ table, op: "write", kind: "update", row: { ...patch, ...f }, f: { ...f } });
              const r = ws.get(`${f.workspace_id}|${f.company_key}`);
              if (!r || r.at !== f.updated_at) return { data: [], error: null };
              r.data = patch.data; r.at = `t${++tick}`;
              return { data: [{ updated_at: r.at }], error: null };
            },
          };
          return q;
        },
        async upsert(row, opts) {
          calls.push({ table, op: "write", kind: "upsert", row, opts });
          if (table === "company_state") tables.company_state.set(`${row.user_id}|${row.company_key}`, row.data);
          return { error: null };
        },
      };
    },
  });
  const writes = () => calls.filter(c => c.op === "write");
  return { client, tables, calls, writes, flags, putWs, wsData, ws };
}
const caps = name => capabilitiesForTemplate(name).map(c => [c]);
const reset = () => ls.clear();

const KESEF = "hq:kesef:v1", BEIT = "hq:beit-hadash:v2", CORE = "hq:core:v1", TX = "hq:kesef-transactions:v1", HEALTH = "hq:wellbeing:v3";

test("RBAC not deployed (missing relation): behaves exactly as today, per user in company_state", async () => {
  reset(); const db = fakeDb({ rbac: false }); const c = db.client(PARTNER);
  const access = await resolveAccess(c);
  assert.equal(access.mode, "personal"); assert.equal(access.reason, "not_enabled");
  assert.deepEqual(await saveWithClient(c, KESEF, { a: 1 }), { synced: true });
  assert.deepEqual(db.tables.company_state.get(`${PARTNER}|${KESEF}`), { a: 1 });
  assert.equal(db.ws.size, 0);
  assert.deepEqual(await loadWithClient(db.client(PARTNER), KESEF), { a: 1 });
  assert.deepEqual(visibleCompanySlugs(access, SLUGS), SLUGS);
});

test("isMissingRelation recognises the common not-deployed errors and nothing else", () => {
  assert.equal(isMissingRelation({ code: "PGRST205" }), true);
  assert.equal(isMissingRelation({ code: "42P01" }), true);
  assert.equal(isMissingRelation({ message: 'relation "workspaces" does not exist' }), true);
  assert.equal(isMissingRelation({ message: "fetch failed" }), false);
  assert.equal(isMissingRelation(null), false);
});


test("RBAC enabled but no shared workspace visible (unapproved user, or owner before step 010): restricted, nothing visible", async () => {
  reset(); const db = fakeDb({ hasWorkspace: false }); const c = db.client(OWNER);
  const access = await resolveAccess(c);
  assert.deepEqual([access.mode, access.reason], ["restricted", "no_workspace"]);
  assert.deepEqual(visibleCompanySlugs(access, SLUGS), []);
  assert.equal(isHqVisible(access), false);
  for (const slug of SLUGS) { assert.equal(canViewCompany(access, slug), false); assert.equal(isCompanyReadOnly(access, slug), true); }
});

test("owner WITH a shared workspace uses workspace_state for shared keys (one copy), full access, personal keys unchanged", async () => {
  reset(); const db = fakeDb(); const c = db.client(OWNER);
  const access = await resolveAccess(c);
  assert.deepEqual([access.mode, access.isOwner, access.reason], ["member", true, "owner"]);
  db.putWs(KESEF, { net: 1 });
  const r = await loadStateWithClient(c, KESEF);
  assert.deepEqual(r, { value: { net: 1 }, canRead: true, canWrite: true, shared: true });
  assert.deepEqual(await saveWithClient(c, KESEF, { net: 2 }), { synced: true });
  assert.deepEqual(db.wsData(KESEF), { net: 2 });
  assert.equal(db.tables.company_state.has(`${OWNER}|${KESEF}`), false);
  await saveWithClient(c, HEALTH, { h: 1 });
  assert.equal(db.writes().at(-1).table, "company_state");
  assert.deepEqual(visibleCompanySlugs(access, SLUGS), SLUGS);
  assert.equal(isHqVisible(access), true);
  assert.equal(isCompanyReadOnly(access, "kesef"), false);
});

test("owner data safety: an empty workspace row is seeded from the owner's company_state (insert only), never lost", async () => {
  reset(); const db = fakeDb(); const c = db.client(OWNER);
  db.tables.company_state.set(`${OWNER}|${KESEF}`, { net: 42 });
  const r = await loadStateWithClient(c, KESEF);
  assert.deepEqual(r.value, { net: 42 });
  assert.deepEqual(db.wsData(KESEF), { net: 42 });
  assert.equal(db.writes().at(-1).kind, "insert"); // לא upsert: אין דריסה אפשרית
  assert.deepEqual(db.tables.company_state.get(`${OWNER}|${KESEF}`), { net: 42 }); // המקור שלם
});

test("owner data safety: an existing workspace row is never overwritten by company_state or the local copy", async () => {
  reset(); const db = fakeDb(); const c = db.client(OWNER);
  db.putWs(KESEF, { net: "shared-truth" });
  db.tables.company_state.set(`${OWNER}|${KESEF}`, { net: "old personal" });
  ls.set(localKey(KESEF, OWNER), JSON.stringify({ net: "old local" }));
  assert.deepEqual((await loadStateWithClient(c, KESEF)).value, { net: "shared-truth" });
  assert.equal(db.writes().length, 0);
});

test("owner data safety: when only an old local copy exists, it seeds the workspace row", async () => {
  reset(); const db = fakeDb(); const c = db.client(OWNER);
  ls.set(localKey(BEIT, OWNER), JSON.stringify({ items: ["local only"] }));
  assert.deepEqual((await loadStateWithClient(c, BEIT)).value, { items: ["local only"] });
  assert.deepEqual(db.wsData(BEIT), { items: ["local only"] });
});

test("a member never seeds the workspace from their own company_state", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance_edit") } } });
  db.tables.company_state.set(`${PARTNER}|${KESEF}`, { leak: "personal row must not be used" });
  assert.equal((await loadStateWithClient(db.client(PARTNER), KESEF)).value, null);
  assert.equal(db.ws.size, 0);
});

test("user without a workspace membership: personal space as today (nothing shared)", async () => {
  reset(); const db = fakeDb({ hasWorkspace: false }); const c = db.client(STRANGER);
  const access = await resolveAccess(c);
  assert.deepEqual([access.mode, access.reason], ["restricted", "no_workspace"]);
  assert.deepEqual(visibleCompanySlugs(access, SLUGS), []);
  assert.equal(isHqVisible(access), false);
  await saveWithClient(c, BEIT, { x: 1 }); // אחסון נשאר אישי (ה-UI לא נגיש); ה-RLS מגן
  assert.equal(db.writes()[0].table, "company_state");
});

test("Lior on B+ (default template): edits finance, transactions, and Beit Hadash; sees core read-only", async () => {
  assert.equal(DEFAULT_PARTNER_TEMPLATE, "partner_full_finance_edit");
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps(DEFAULT_PARTNER_TEMPLATE) } } });
  db.putWs(KESEF, { netWorth: 100 }); db.putWs(CORE, { mySalary: 1 });
  const c = db.client(PARTNER);
  assert.deepEqual(await loadStateWithClient(c, KESEF), { value: { netWorth: 100 }, canRead: true, canWrite: true, shared: true });
  assert.deepEqual(await saveWithClient(c, KESEF, { netWorth: 200 }), { synced: true });
  assert.deepEqual(db.wsData(KESEF), { netWorth: 200 });
  assert.deepEqual(await saveWithClient(c, TX, { rows: [1] }), { synced: true }); // תנועות: עריכה
  assert.deepEqual(db.wsData(TX), { rows: [1] });
  assert.deepEqual(await saveWithClient(c, BEIT, { items: [1] }), { synced: true });
  assert.deepEqual(db.wsData(BEIT), { items: [1] });
  const core = await loadStateWithClient(c, CORE);
  assert.deepEqual([core.canRead, core.canWrite], [true, false]); // אין core.write בחבילה
  assert.equal(db.tables.company_state.size, 0);
  const access = await resolveAccess(c);
  assert.equal(isCompanyReadOnly(access, "kesef"), false); // אין באנר קריאה בלבד
  assert.equal(isCompanyReadOnly(access, "beit-hadash"), false);
});

test("partner_full_finance (B, read-only package): no writes are attempted for finance", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance") } } });
  db.putWs(KESEF, { netWorth: 100 });
  const c = db.client(PARTNER);
  assert.deepEqual(await loadStateWithClient(c, KESEF), { value: { netWorth: 100 }, canRead: true, canWrite: false, shared: true });
  const tx = await loadStateWithClient(c, TX);
  assert.deepEqual([tx.canRead, tx.canWrite], [true, false]);
  const before = db.writes().length;
  assert.deepEqual(await saveWithClient(c, KESEF, { netWorth: 999 }), { synced: false, reason: "read-only" });
  assert.deepEqual(await saveWithClient(c, TX, { rows: [] }), { synced: false, reason: "read-only" });
  assert.equal(db.writes().length, before, "no write may be attempted for a read-only capability");
  assert.deepEqual(db.wsData(KESEF), { netWorth: 100 });
  assert.equal(ls.has(localKey(KESEF, PARTNER)), false);
  const access = await resolveAccess(c);
  assert.equal(isCompanyReadOnly(access, "kesef"), true);
  assert.equal(isCompanyReadOnly(access, "beit-hadash"), false);
});

test("designer (Shaked): edits Beit Hadash incl. documents end to end; finance and core denied with no read and no cache", async () => {
  reset(); const db = fakeDb({ members: { [DESIGNER]: { caps: caps("designer_beit_hadash") } } });
  db.putWs(KESEF, { secret: 1 }); db.putWs(BEIT, { items: ["a"], documents: [] });
  const c = db.client(DESIGNER);
  const b = await loadStateWithClient(c, BEIT);
  assert.deepEqual(b, { value: { items: ["a"], documents: [] }, canRead: true, canWrite: true, shared: true });
  const doc = { id: "d1", title: "תוכנית נגרות", path: `${WS}/uuid-plan.pdf`, uploadedBy: DESIGNER };
  assert.deepEqual(await saveWithClient(c, BEIT, { items: ["a", "b"], documents: [doc] }), { synced: true });
  assert.deepEqual(db.wsData(BEIT).documents, [doc]); // מטא-דאטה של מסמכים נשמרת במפתח המשותף
  assert.deepEqual(await saveWithClient(c, BEIT, { items: ["a", "b"], documents: [] }), { synced: true }); // מחיקת מסמך שהעלתה
  for (const key of [KESEF, CORE, TX]) {
    const r = await loadStateWithClient(c, key);
    assert.deepEqual([r.value, r.canRead, r.canWrite], [null, false, false], key);
    assert.deepEqual(await saveWithClient(c, key, { hack: 1 }), { synced: false, reason: "read-only" });
  }
  assert.equal(db.calls.some(x => x.op === "read" && x.f.company_key === KESEF), false, "denied keys are never even queried");
  assert.equal(db.writes().some(w => w.row.company_key !== BEIT), false);
  const access = await resolveAccess(c);
  assert.deepEqual(visibleCompanySlugs(access, SLUGS), ["beit-hadash"]);
  assert.equal(isHqVisible(access), false);
  assert.equal(isCompanyReadOnly(access, "beit-hadash"), false);
  assert.equal(canViewCompany(access, "health"), false);
  assert.equal(canViewCompany(access, "avoda"), false);
});

test("partner sees Beit Hadash, finance and her own (empty) career; never health or wellbeing", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance_edit") } } });
  const access = await resolveAccess(db.client(PARTNER));
  assert.deepEqual(visibleCompanySlugs(access, SLUGS), ["beit-hadash", "kesef", "avoda"]);
  assert.equal(isHqVisible(access), true);
  assert.equal(isCompanyReadOnly(access, "avoda"), false);
});

test("personal keys of a member (health, career) stay in company_state per user and never touch workspace_state", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance_edit") } } });
  db.tables.company_state.set(`${OWNER}|${HEALTH}`, { owner: "private" });
  const c = db.client(PARTNER);
  const r = await loadStateWithClient(c, HEALTH);
  assert.deepEqual([r.value, r.shared, r.canWrite], [null, false, true]);
  await saveWithClient(c, "hq:career:v1", { mine: 1 });
  const w = db.writes().at(-1);
  assert.equal(w.table, "company_state"); assert.equal(w.row.user_id, PARTNER);
  assert.equal(db.ws.size, 0);
  assert.equal(db.calls.some(x => x.table === "workspace_state"), false);
});

test("a revoked capability is not a grant", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: [["company.beit-hadash.read"], ["company.beit-hadash.write", "2026-01-01"]] } } });
  const access = await resolveAccess(db.client(PARTNER));
  assert.deepEqual(access.grants, ["company.beit-hadash.read"]);
  assert.equal(isCompanyReadOnly(access, "beit-hadash"), true);
});

test("shared cache is scoped by workspace and user: a second user on the same browser never sees it", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance_edit") }, [DESIGNER]: { caps: caps("designer_beit_hadash") } } });
  db.putWs(BEIT, { items: ["shared"] });
  await loadWithClient(db.client(PARTNER), BEIT);
  assert.equal(ls.has(localKey(`ws:${WS}:${BEIT}`, PARTNER)), true);
  assert.equal(ls.has(localKey(BEIT, PARTNER)), false);
  db.ws.clear();
  assert.equal(await loadWithClient(db.client(DESIGNER), BEIT), null);
});

test("offline: a member falls back to the local copy of the shared key", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance_edit") } } });
  db.putWs(KESEF, { v: 1 });
  const c = db.client(PARTNER);
  await loadWithClient(c, KESEF);
  const orig = c.from; c.from = t => t === "workspace_state" ? { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => { throw new Error("offline"); } }) }) }) } : orig(t);
  assert.deepEqual(await loadWithClient(c, KESEF), { v: 1 });
});

test("a local copy is uploaded when the row is missing only for a writer, and only as an insert", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance") } } });
  ls.set(localKey(`ws:${WS}:${KESEF}`, PARTNER), JSON.stringify({ stale: 1 }));
  ls.set(localKey(`ws:${WS}:${BEIT}`, PARTNER), JSON.stringify({ mine: 1 }));
  const c = db.client(PARTNER);
  assert.deepEqual((await loadStateWithClient(c, KESEF)).value, { stale: 1 });
  assert.equal(db.writes().length, 0, "read-only: no upload");
  await loadStateWithClient(c, BEIT);
  assert.deepEqual(db.writes().map(w => w.kind), ["insert"]);
});

test("a transient failure while resolving access is not cached, and falls back to today's behavior meanwhile", async () => {
  reset(); const bad = fakeDb({ failWorkspaces: true, members: { [PARTNER]: { caps: caps("partner_full_finance") } } });
  const c = bad.client(PARTNER);
  const a1 = await resolveAccess(c);
  assert.deepEqual([a1.mode, a1.reason], ["restricted", "unavailable"]);
  await saveWithClient(c, KESEF, { x: 1 });
  assert.equal(bad.writes().at(-1).table, "company_state");
  bad.flags.failWorkspaces = false;
  assert.equal((await resolveAccess(c)).mode, "member");
});

test("access resolution is cached per client so each load does not re-query the workspace", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance_edit") } } });
  const c = db.client(PARTNER);
  await loadWithClient(c, KESEF); await loadWithClient(c, BEIT); await saveWithClient(c, BEIT, {});
  assert.equal(db.calls.filter(x => x.table === "workspaces").length, 1);
});

test("no session: local-only, RBAC never queried", async () => {
  reset(); const db = fakeDb(); const c = db.client(null);
  assert.deepEqual(await saveWithClient(c, KESEF, { a: 1 }), { synced: false, reason: "no-session" });
  assert.deepEqual(await loadWithClient(c, KESEF), { a: 1 });
  assert.equal(db.calls.length, 0);
});

// ---------- עורכים במקביל ----------

test("two editors: a stale write is rejected as a conflict and never overwrites the other editor", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance_edit") }, [DESIGNER]: { caps: caps("designer_beit_hadash") } } });
  db.putWs(BEIT, { items: ["base"] });
  const lior = db.client(PARTNER), shaked = db.client(DESIGNER);
  await loadWithClient(lior, BEIT); await loadWithClient(shaked, BEIT);
  assert.deepEqual(await saveWithClient(shaked, BEIT, { items: ["base", "shaked"] }), { synced: true });
  const r = await saveWithClient(lior, BEIT, { items: ["base", "lior"] }); // Lior עובדת על גרסה ישנה
  assert.deepEqual([r.synced, r.reason], [false, "conflict"]);
  assert.ok(r.message);
  assert.deepEqual(db.wsData(BEIT), { items: ["base", "shaked"] }, "Shaked's edit survives");
  // אחרי טעינה מחדש (מה ש-useStore עושה על conflict) Lior רואה את העדכון וכותבת עליו
  assert.deepEqual(await loadWithClient(lior, BEIT), { items: ["base", "shaked"] });
  assert.deepEqual(await saveWithClient(lior, BEIT, { items: ["base", "shaked", "lior"] }), { synced: true });
  assert.deepEqual(db.wsData(BEIT).items, ["base", "shaked", "lior"]);
});

test("two editors: creating the same missing row concurrently is a conflict, not an overwrite", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance_edit") } } });
  const c = db.client(PARTNER);
  assert.equal(await loadWithClient(c, KESEF), null); // אין שורה
  db.putWs(KESEF, { by: "someone else" });             // מישהו יצר בינתיים
  const r = await saveWithClient(c, KESEF, { by: "me" });
  assert.equal(r.reason, "conflict");
  assert.deepEqual(db.wsData(KESEF), { by: "someone else" });
});

test("one editor's rapid saves are serialized and never conflict with themselves", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance_edit") } } });
  db.putWs(BEIT, { n: 0 });
  const c = db.client(PARTNER);
  await loadWithClient(c, BEIT);
  const results = await Promise.all([1, 2, 3, 4].map(n => saveWithClient(c, BEIT, { n })));
  assert.deepEqual(results.map(r => r.synced), [true, true, true, true]);
  assert.deepEqual(db.wsData(BEIT), { n: 4 });
});

test("saving unchanged data after a load writes nothing (no needless updated_at bump that would conflict others)", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance_edit") } } });
  db.putWs(BEIT, { n: 1 });
  const c = db.client(PARTNER);
  const v = await loadWithClient(c, BEIT);
  assert.deepEqual(await saveWithClient(c, BEIT, v), { synced: true });
  assert.equal(db.writes().length, 0);
});

test("personal keys keep last-write-wins upsert exactly as before (no conflict logic)", async () => {
  reset(); const db = fakeDb({ hasWorkspace: false }); const c = db.client(OWNER);
  await saveWithClient(c, KESEF, { a: 1 });
  assert.equal(db.writes()[0].kind, "upsert");
});

// ---------- מצב קריאה בלבד ב-UI ----------

const fakeEl = ({ text = "", label = "", icons = [], edit } = {}) => ({
  textContent: text,
  getAttribute: n => (n === "aria-label" ? label || null : n === "data-hq-edit" ? edit || null : null),
  querySelector: sel => (icons.some(i => sel === `svg.lucide-${i}`) ? {} : null),
});

test("read-only UI: edit controls are recognised, navigation and view controls are not", () => {
  for (const el of [fakeEl({ text: "הוסף פריט" }), fakeEl({ text: "+ תשלום שבוצע" }), fakeEl({ text: "שמירה" }), fakeEl({ label: "מחיקה" }), fakeEl({ icons: ["trash-2"] }),
    fakeEl({ icons: ["pencil"] }), fakeEl({ icons: ["upload"] }), fakeEl({ text: "מחק" }), fakeEl({ edit: "1" })]) assert.equal(isEditControl(el), true);
  for (const el of [fakeEl({ text: "תמונת מצב" }), fakeEl({ text: "תזרים" }), fakeEl({ label: "סגירה", icons: ["x"] }), fakeEl({ label: "פתיחת קובץ" }), fakeEl({ text: "מסמכים ובדק" })]) assert.equal(isEditControl(el), false);
});

test("applyReadOnly disables inputs and edit buttons with a clear title, leaves navigation active", () => {
  const mk = (props, tag = "button") => { const attrs = {}; return { tag, disabled: false, style: {}, textContent: props.text || "", setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: k => (k in attrs ? attrs[k] : k === "aria-label" ? props.label || null : null), querySelector: () => null, attrs }; };
  const input = mk({}, "input"), add = mk({ text: "הוסף" }), nav = mk({ text: "תזרים" });
  const root = { querySelectorAll: sel => (sel === "button" ? [add, nav] : [input]) };
  const off = applyReadOnly(root, null);
  assert.equal(input.disabled, true); assert.equal(add.disabled, true); assert.equal(nav.disabled, false);
  assert.equal(add.attrs.title, READONLY_TITLE);
  off();
});

// ---------- fail-closed בהצגה ----------

const expectClosed = (access, reason) => {
  assert.deepEqual([access.mode, access.reason], ["restricted", reason]);
  assert.deepEqual(visibleCompanySlugs(access, SLUGS), []);
  assert.equal(isHqVisible(access), false);
  for (const slug of SLUGS) assert.equal(canViewCompany(access, slug), false, slug);
};

test("not_enabled (RBAC never deployed) keeps the legacy behaviour: everything visible, owner not locked out", async () => {
  reset(); const db = fakeDb({ rbac: false });
  const access = await resolveAccess(db.client(OWNER));
  assert.deepEqual([access.mode, access.reason], ["personal", "not_enabled"]);
  assert.deepEqual(visibleCompanySlugs(access, SLUGS), SLUGS);
  assert.equal(isHqVisible(access), true);
  assert.equal(isCompanyReadOnly(access, "kesef"), false);
});

test("unavailable: a failing workspace query shows nothing (no restricted company, no CEO screen)", async () => {
  reset(); const db = fakeDb({ failWorkspaces: true, members: { [PARTNER]: { caps: caps("partner_full_finance_edit") } } });
  expectClosed(await resolveAccess(db.client(PARTNER)), "unavailable");
});

test("timeout: a hanging workspace query fails closed instead of showing everything", async () => {
  reset(); const db = fakeDb(); db.flags.hang = true;
  expectClosed(await resolveAccess(db.client(PARTNER), { timeoutMs: 20 }), "unavailable");
});

test("a failed capabilities lookup fails closed (never falls back to full visibility)", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance_edit") } } }); db.flags.failCaps = true;
  expectClosed(await resolveAccess(db.client(PARTNER)), "unavailable");
});

test("a malformed response fails closed", async () => {
  reset();
  const weird = { auth: { getSession: async () => ({ data: { session: { user: { id: PARTNER } } } }) }, from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: "nope", error: null }) }) }) }) };
  expectClosed(await resolveAccess(weird), "unavailable");
});

test("a removed member loses the cached grants: restricted, and a later network drop does not bring them back", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance_edit") } } });
  assert.equal((await resolveAccess(db.client(PARTNER))).mode, "member"); // אומת ונשמר
  assert.ok(ls.has(`u:${PARTNER}:hq:access:v1`));
  const removed = fakeDb({ hasWorkspace: false });
  expectClosed(await resolveAccess(removed.client(PARTNER)), "no_workspace");
  assert.equal(ls.has(`u:${PARTNER}:hq:access:v1`), false, "cache cleared on removal");
  removed.flags.failWorkspaces = true;
  expectClosed(await resolveAccess(removed.client(PARTNER)), "unavailable");
});

test("member with capabilities: sees exactly what the grants allow", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance_edit") }, [DESIGNER]: { caps: caps("designer_beit_hadash") } } });
  assert.deepEqual(visibleCompanySlugs(await resolveAccess(db.client(PARTNER)), SLUGS), ["beit-hadash", "kesef", "avoda"]);
  assert.deepEqual(visibleCompanySlugs(await resolveAccess(db.client(DESIGNER)), SLUGS), ["beit-hadash"]);
});

test("owner (verified): sees everything", async () => {
  reset(); const db = fakeDb();
  const a = await resolveAccess(db.client(OWNER));
  assert.deepEqual(visibleCompanySlugs(a, SLUGS), SLUGS); assert.equal(isHqVisible(a), true);
});

test("network drops AFTER verification: last verified grants are used, without widening access (partner)", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance") } } });
  const first = await resolveAccess(db.client(PARTNER));
  assert.equal(first.mode, "member");
  db.flags.failWorkspaces = true;
  const off = await resolveAccess(db.client(PARTNER));
  assert.deepEqual([off.mode, off.reason, off.stale], ["member", "cached", true]);
  assert.deepEqual(off.grants, first.grants);
  assert.deepEqual(visibleCompanySlugs(off, SLUGS), ["beit-hadash", "kesef", "avoda"]);
  assert.equal(isCompanyReadOnly(off, "kesef"), true); // B נשארת קריאה בלבד גם offline
});

test("network drops AFTER verification: the owner is not locked out (member-owner and legacy not_enabled)", async () => {
  reset(); let db = fakeDb(); await resolveAccess(db.client(OWNER));
  db.flags.failWorkspaces = true;
  const off = await resolveAccess(db.client(OWNER));
  assert.deepEqual([off.mode, off.isOwner, off.reason], ["member", true, "cached"]);
  assert.deepEqual(visibleCompanySlugs(off, SLUGS), SLUGS);
  reset(); db = fakeDb({ rbac: false }); await resolveAccess(db.client(OWNER));
  const off2 = await resolveAccess(fakeDb({ failWorkspaces: true }).client(OWNER));
  assert.deepEqual([off2.mode, off2.reason], ["personal", "cached"]);
  assert.deepEqual(visibleCompanySlugs(off2, SLUGS), SLUGS);
});

test("the last-verified cache is per user: another user on the same device gets nothing from it", async () => {
  reset(); const db = fakeDb();
  await resolveAccess(db.client(OWNER));
  db.flags.failWorkspaces = true;
  expectClosed(await resolveAccess(db.client(STRANGER)), "unavailable");
});

test("a tampered or expired last-verified cache is ignored (fail closed)", async () => {
  reset(); const db = fakeDb();
  await resolveAccess(db.client(OWNER));
  const k = `u:${OWNER}:hq:access:v1`;
  const good = JSON.parse(ls.get(k));
  db.flags.failWorkspaces = true;
  ls.set(k, JSON.stringify({ ...good, at: Date.now() - 31 * 24 * 3600 * 1000 })); // ישן מדי
  expectClosed(await resolveAccess(db.client(OWNER)), "unavailable");
  ls.set(k, JSON.stringify({ ...good, mode: "restricted" })); // מצב לא מאומת
  expectClosed(await resolveAccess(db.client(OWNER)), "unavailable");
  ls.set(k, "{not json");
  expectClosed(await resolveAccess(db.client(OWNER)), "unavailable");
  ls.set(k, JSON.stringify({ ...good, grants: ["core.write", "made.up"] })); // יכולות לא קיימות מסוננות
  assert.equal((await resolveAccess(db.client(OWNER))).grants.includes("made.up"), false);
});

test("unknown or missing access object is closed everywhere", () => {
  for (const a of [null, undefined, {}, { mode: "weird" }]) {
    assert.deepEqual(visibleCompanySlugs(a, SLUGS), []);
    assert.equal(isHqVisible(a), false);
    assert.equal(canViewCompany(a, "kesef"), false);
  }
});

// ---------- JARVIS ----------

const SUMMARIES = {
  "beit-hadash": { summary: { renovation: { paid: 1, planned: 2 } }, data: { items: [{ name: "x", status: "בתהליך", beforeMove: true }] } },
  kesef: { summary: { netWorth: 999, overBudget: false }, data: {} },
  health: { summary: { weekWorkouts: 3, profile: { goal: "secret-goal" } }, data: {} },
  avoda: { summary: { activeJobs: 2, nextStep: { company: "acme", text: "call" } }, data: {} },
  nefesh: { summary: {}, data: { today: { load: 9, status: "secret-status" }, decisions: [{ status: "open", title: "private decision" }] } },
};
const ctx = (visible, extra = {}) => buildJarvisContext({ visible: new Set(visible), greeting: "hi", openTasks: 1, urgentActions: [], income: 5, core: { mortgageMonthly: 7 }, coreDenied: false, summaries: SUMMARIES, ...extra });

test("JARVIS context contains only sections of visible companies, and hidden ones are absent entirely", () => {
  const lior = ctx(["beit-hadash", "kesef", "avoda"]);
  assert.deepEqual(Object.keys(lior).sort(), ["career", "finance", "greeting", "home", "money", "openTasks", "urgentActions"]);
  const text = JSON.stringify(lior);
  for (const leak of ["secret-goal", "secret-status", "private decision", "weekWorkouts", "wellbeing", "health"]) assert.equal(text.includes(leak), false, leak);
  assert.deepEqual(Object.keys(ctx(["beit-hadash"], { coreDenied: true })).sort(), ["greeting", "home", "openTasks", "urgentActions"]);
  assert.deepEqual(Object.keys(ctx([])).sort(), ["greeting", "money", "openTasks", "urgentActions"]);
  assert.equal(ctx(["health", "nefesh"]).health.goal, "secret-goal"); // כשהכול גלוי (owner / RBAC כבוי)
});

test("JARVIS visible set derived from access: restricted and unapproved get no company sections", async () => {
  reset();
  for (const access of [await resolveAccess(fakeDb({ failWorkspaces: true }).client(PARTNER)), await resolveAccess(fakeDb({ hasWorkspace: false }).client(PARTNER))]) {
    const keys = Object.keys(ctx(visibleCompanySlugs(access, SLUGS), { coreDenied: true }));
    assert.deepEqual(keys.sort(), ["greeting", "openTasks", "urgentActions"]);
  }
});
