import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "placeholder-anon-key";

const ls = new Map();
globalThis.window = { localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); }, removeItem: k => { ls.delete(k); } } };

const { loadStateWithClient, loadWithClient, saveWithClient, localKey } = await import("../lib/store.js");
const { resolveAccess, visibleCompanySlugs, isCompanyReadOnly, isHqVisible, canViewCompany, isMissingRelation } = await import("../lib/workspace.js");
const { capabilitiesForTemplate } = await import("../lib/authz/capabilities.js");

// כל המזהים כאן בדויים.
const WS = "ws-shared-1";
const OWNER = "user-owner", PARTNER = "user-partner", DESIGNER = "user-designer", STRANGER = "user-stranger";
const SLUGS = ["beit-hadash", "kesef", "health", "avoda", "nefesh"];

/** מסד מזויף בזיכרון. rbac:false = הטבלאות לא קיימות (PGRST205), כמו לפני הפריסה. */
function fakeDb({ rbac = true, members = {}, workspaceOwner = OWNER, failWorkspaces = false } = {}) {
  const tables = { company_state: new Map(), workspace_state: new Map() };
  const calls = [];
  const flags = { failWorkspaces };
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
              if (table === "workspace_state") { const r = tables.workspace_state.get(`${f.workspace_id}|${f.company_key}`); return { data: r === undefined ? null : { data: r }, error: null }; }
              return { data: null, error: null };
            },
            then(res, rej) {
              if (!rbac) return Promise.resolve({ data: null, error: { code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` } }).then(res, rej);
              if (flags.failWorkspaces) return Promise.resolve({ data: null, error: { message: "fetch failed" } }).then(res, rej);
              if (table === "workspaces") { const m = members[uid]; return Promise.resolve({ data: m || uid === workspaceOwner ? [{ id: WS, owner_id: workspaceOwner }] : [], error: null }).then(res, rej); }
              if (table === "member_capabilities") return Promise.resolve({ data: (members[uid]?.caps || []).map(([capability, revoked_at]) => ({ capability, revoked_at: revoked_at || null })), error: null }).then(res, rej);
              return Promise.resolve({ data: [], error: null }).then(res, rej);
            },
          };
          return q;
        },
        async upsert(row, opts) {
          calls.push({ table, op: "write", row, opts });
          if (table === "company_state") tables.company_state.set(`${row.user_id}|${row.company_key}`, row.data);
          else if (table === "workspace_state") tables.workspace_state.set(`${row.workspace_id}|${row.company_key}`, row.data);
          return { error: null };
        },
      };
    },
  });
  const writes = () => calls.filter(c => c.op === "write");
  return { client, tables, calls, writes, flags };
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
  assert.equal(db.tables.workspace_state.size, 0);
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

test("owner: unchanged, shared keys stay in company_state, fully writable, sees everything", async () => {
  reset(); const db = fakeDb(); const c = db.client(OWNER);
  const access = await resolveAccess(c);
  assert.equal(access.mode, "personal"); assert.equal(access.reason, "owner");
  const r = await loadStateWithClient(c, KESEF);
  assert.deepEqual([r.canRead, r.canWrite, r.shared], [true, true, false]);
  assert.deepEqual(await saveWithClient(c, KESEF, { net: 5 }), { synced: true });
  assert.equal(db.tables.company_state.has(`${OWNER}|${KESEF}`), true);
  assert.equal(db.tables.workspace_state.size, 0);
  assert.deepEqual(visibleCompanySlugs(access, SLUGS), SLUGS);
  assert.equal(isHqVisible(access), true);
});

test("user without a workspace membership: personal space as today (nothing shared)", async () => {
  reset(); const db = fakeDb(); const c = db.client(STRANGER);
  const access = await resolveAccess(c);
  assert.equal(access.mode, "personal"); assert.equal(access.reason, "no_workspace");
  await saveWithClient(c, BEIT, { x: 1 });
  assert.equal(db.writes()[0].table, "company_state");
});

test("partner_full_finance (Lior): shared keys come from workspace_state, finance is read-only, no writes attempted", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance") } } });
  db.tables.workspace_state.set(`${WS}|${KESEF}`, { netWorth: 100 });
  db.tables.workspace_state.set(`${WS}|${CORE}`, { mySalary: 1 });
  db.tables.company_state.set(`${PARTNER}|${KESEF}`, { leak: "personal row must not be used" });
  const c = db.client(PARTNER);

  const k = await loadStateWithClient(c, KESEF);
  assert.deepEqual(k, { value: { netWorth: 100 }, canRead: true, canWrite: false, shared: true });
  const core = await loadStateWithClient(c, CORE);
  assert.deepEqual([core.canRead, core.canWrite], [true, false]);
  const tx = await loadStateWithClient(c, TX);
  assert.deepEqual([tx.canRead, tx.canWrite], [true, false]); // תנועות: קריאה כן, כתיבה לא (B ולא B+)

  const before = db.writes().length;
  assert.deepEqual(await saveWithClient(c, KESEF, { netWorth: 999 }), { synced: false, reason: "read-only" });
  assert.deepEqual(await saveWithClient(c, TX, { rows: [] }), { synced: false, reason: "read-only" });
  assert.equal(db.writes().length, before, "no write may be attempted for a read-only capability");
  assert.deepEqual(db.tables.workspace_state.get(`${WS}|${KESEF}`), { netWorth: 100 });
  assert.equal(ls.has(localKey(KESEF, PARTNER)), false); // גם לא נכתב cache מקומי שקרי
});

test("partner can edit Beit Hadash (write capability) and it goes to workspace_state with the composite conflict target", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance") } } });
  const c = db.client(PARTNER);
  assert.deepEqual(await saveWithClient(c, BEIT, { items: [1] }), { synced: true });
  const w = db.writes().at(-1);
  assert.equal(w.table, "workspace_state");
  assert.deepEqual([w.row.workspace_id, w.row.company_key], [WS, BEIT]);
  assert.equal(w.opts.onConflict, "workspace_id,company_key");
  assert.equal(db.tables.company_state.size, 0);
});

test("partner_full_finance_edit (B+) can write finance", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance_edit") } } });
  const c = db.client(PARTNER);
  assert.deepEqual(await saveWithClient(c, KESEF, { v: 2 }), { synced: true });
  assert.deepEqual(db.tables.workspace_state.get(`${WS}|${KESEF}`), { v: 2 });
});

test("designer (Shaked): only Beit Hadash; finance and core are denied with no network read and no cache", async () => {
  reset(); const db = fakeDb({ members: { [DESIGNER]: { caps: caps("designer_beit_hadash") } } });
  db.tables.workspace_state.set(`${WS}|${KESEF}`, { secret: 1 });
  db.tables.workspace_state.set(`${WS}|${BEIT}`, { items: ["a"] });
  const c = db.client(DESIGNER);
  const b = await loadStateWithClient(c, BEIT);
  assert.deepEqual(b, { value: { items: ["a"] }, canRead: true, canWrite: true, shared: true });
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
  assert.equal(canViewCompany(access, "health"), false);
  assert.equal(canViewCompany(access, "avoda"), false);
});

test("partner sees Beit Hadash, finance and her own (empty) career; never health or wellbeing", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance") } } });
  const access = await resolveAccess(db.client(PARTNER));
  assert.deepEqual(visibleCompanySlugs(access, SLUGS), ["beit-hadash", "kesef", "avoda"]);
  assert.equal(isHqVisible(access), true);
  assert.equal(isCompanyReadOnly(access, "kesef"), true);
  assert.equal(isCompanyReadOnly(access, "beit-hadash"), false);
  assert.equal(isCompanyReadOnly(access, "avoda"), false);
});

test("personal keys of a member (health, career) stay in company_state per user and never touch workspace_state", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance") } } });
  db.tables.company_state.set(`${OWNER}|${HEALTH}`, { owner: "private" });
  const c = db.client(PARTNER);
  const r = await loadStateWithClient(c, HEALTH);
  assert.deepEqual([r.value, r.shared, r.canWrite], [null, false, true]); // ריק: לא יורש דבר מה-owner
  await saveWithClient(c, "hq:career:v1", { mine: 1 });
  const w = db.writes().at(-1);
  assert.equal(w.table, "company_state"); assert.equal(w.row.user_id, PARTNER);
  assert.equal(db.tables.workspace_state.size, 0);
  assert.equal(db.calls.some(x => x.table === "workspace_state"), false);
});

test("a revoked capability is not a grant", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: [["company.beit-hadash.read"], ["company.beit-hadash.write", "2026-01-01"]] } } });
  const access = await resolveAccess(db.client(PARTNER));
  assert.deepEqual(access.grants, ["company.beit-hadash.read"]);
  assert.equal(isCompanyReadOnly(access, "beit-hadash"), true);
});

test("shared cache is scoped by workspace and user: a second user on the same browser never sees it", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance") }, [DESIGNER]: { caps: caps("designer_beit_hadash") } } });
  db.tables.workspace_state.set(`${WS}|${BEIT}`, { items: ["shared"] });
  await loadWithClient(db.client(PARTNER), BEIT);
  assert.equal(ls.has(localKey(`ws:${WS}:${BEIT}`, PARTNER)), true);
  assert.equal(ls.has(localKey(BEIT, PARTNER)), false); // לא מזהם את מפתח ה-cache האישי
  db.tables.workspace_state.delete(`${WS}|${BEIT}`);
  assert.equal(await loadWithClient(db.client(DESIGNER), BEIT), null); // בלי שורה בענן וללא cache שלה
});

test("offline: a member falls back to the local copy of the shared key", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance") } } });
  db.tables.workspace_state.set(`${WS}|${KESEF}`, { v: 1 });
  const c = db.client(PARTNER);
  await loadWithClient(c, KESEF);
  const orig = c.from; c.from = t => t === "workspace_state" ? { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => { throw new Error("offline"); } }) }) }) } : orig(t);
  assert.deepEqual(await loadWithClient(c, KESEF), { v: 1 });
});

test("uploading a local copy when the cloud row is missing happens only for a writer", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance") } } });
  ls.set(localKey(`ws:${WS}:${KESEF}`, PARTNER), JSON.stringify({ stale: 1 }));
  ls.set(localKey(`ws:${WS}:${BEIT}`, PARTNER), JSON.stringify({ mine: 1 }));
  const c = db.client(PARTNER);
  assert.deepEqual((await loadStateWithClient(c, KESEF)).value, { stale: 1 });
  assert.equal(db.writes().length, 0, "read-only: no upload");
  await loadStateWithClient(c, BEIT);
  assert.equal(db.writes().length, 1, "writer: uploads the local copy");
});

test("a transient failure while resolving access is not cached, and falls back to today's behavior meanwhile", async () => {
  reset(); const bad = fakeDb({ failWorkspaces: true, members: { [PARTNER]: { caps: caps("partner_full_finance") } } });
  const c = bad.client(PARTNER);
  const a1 = await resolveAccess(c);
  assert.equal(a1.mode, "personal"); assert.equal(a1.reason, "unavailable");
  await saveWithClient(c, KESEF, { x: 1 });
  assert.equal(bad.writes().at(-1).table, "company_state");
  // אותו client, הרשת חזרה: הבירור הבא לא נתקע על התשובה הזמנית
  bad.flags.failWorkspaces = false; bad.tables.company_state.clear();
  const a2 = await resolveAccess(c);
  assert.equal(a2.mode, "member");
});

test("access resolution is cached per client so each load does not re-query the workspace", async () => {
  reset(); const db = fakeDb({ members: { [PARTNER]: { caps: caps("partner_full_finance") } } });
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
