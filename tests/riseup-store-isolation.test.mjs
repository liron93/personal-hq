// מראה את tests/store-cache.test.mjs, ממוקד במפתח הספציפי של סנכרון RiseUp
// (hq:kesef:riseup-snapshot:v1). אין tests/market-snapshot-store-isolation.test.mjs בענף
// הבסיס (asaf/api-auth-hardening) לצטט ממנו בפועל - הקובץ לא קיים שם (נבדק לפני הכתיבה);
// זהו אותו דפוס בדיקה שכן קיים בפועל ב-tests/store-cache.test.mjs, על lib/store.js עצמו.
import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "placeholder-anon-key";

const store = new Map();
globalThis.window = { localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); } } };
const { loadWithClient, saveWithClient, localKey } = await import("../lib/store.js");
const { RISEUP_STORE_KEY } = await import("../companies/kesef/riseup-sync-model.js");

function cloud() {
  const rows = new Map();
  const client = uid => ({
    auth: { getSession: async () => ({ data: { session: uid ? { user: { id: uid } } : null } }) },
    from: () => ({
      select: () => ({ eq: (_c, u) => ({ eq: (_c2, k) => ({ maybeSingle: async () => ({ data: rows.has(`${u}|${k}`) ? { data: rows.get(`${u}|${k}`) } : null, error: null }) }) }) }),
      upsert: async r => { rows.set(`${r.user_id}|${r.company_key}`, r.data); return { error: null }; },
    }),
  });
  return { client, rows };
}
const reset = () => store.clear();

test("RiseUp snapshot: a second user on the same browser never sees the first user's synced budget", async () => {
  reset();
  const c = cloud();
  const secretSnapshot = { snapshot: { budgetDate: "2026-09", cashflowHash: "h1", summary: { income: { planned: 12000, actual: 11500 } } }, lastError: null };
  await saveWithClient(c.client("amit"), RISEUP_STORE_KEY, secretSnapshot);

  const seenByOther = await loadWithClient(c.client("lior"), RISEUP_STORE_KEY);
  assert.equal(seenByOther, null);
  assert.equal(c.rows.has(`lior|${RISEUP_STORE_KEY}`), false);

  const seenByOwner = await loadWithClient(c.client("amit"), RISEUP_STORE_KEY);
  assert.deepEqual(seenByOwner, secretSnapshot);
});

test("RiseUp snapshot: each user keeps their own local cache even while alternating on one device, offline", async () => {
  reset();
  const c = cloud();
  await saveWithClient(c.client("amit"), RISEUP_STORE_KEY, { snapshot: { cashflowHash: "amit-hash" }, lastError: null });
  await saveWithClient(c.client("lior"), RISEUP_STORE_KEY, { snapshot: { cashflowHash: "lior-hash" }, lastError: null });
  assert.equal(JSON.parse(store.get(localKey(RISEUP_STORE_KEY, "amit"))).snapshot.cashflowHash, "amit-hash");
  assert.equal(JSON.parse(store.get(localKey(RISEUP_STORE_KEY, "lior"))).snapshot.cashflowHash, "lior-hash");
});

test("RiseUp snapshot: without a session, works locally only and never touches the network", async () => {
  reset();
  const noNet = { auth: { getSession: async () => ({ data: { session: null } }) }, from: () => { throw new Error("network must not be used"); } };
  const value = { snapshot: null, lastError: { code: "not_configured", message: "לא מוגדר" } };
  assert.deepEqual(await saveWithClient(noNet, RISEUP_STORE_KEY, value), { synced: false, reason: "no-session" });
  assert.deepEqual(await loadWithClient(noNet, RISEUP_STORE_KEY), value);
});
