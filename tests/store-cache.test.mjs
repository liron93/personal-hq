import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "placeholder-anon-key";

// דפדפן אחד משותף לכמה משתמשים: localStorage אחד, ענן נפרד לפי user_id.
const store = new Map();
globalThis.window = { localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); } } };
const { loadWithClient, saveWithClient, localKey } = await import("../lib/store.js");

function cloud() {
  const rows = new Map();
  let offline = false;
  const client = uid => ({
    auth: { getSession: async () => ({ data: { session: uid ? { user: { id: uid } } : null } }) },
    from: () => ({
      select: () => ({ eq: (_c, u) => ({ eq: (_c2, k) => ({ maybeSingle: async () => {
        if (offline) throw new Error("offline");
        return { data: rows.has(`${u}|${k}`) ? { data: rows.get(`${u}|${k}`) } : null, error: null };
      } }) }) }),
      upsert: async r => { if (offline) return { error: new Error("offline") }; rows.set(`${r.user_id}|${r.company_key}`, r.data); return { error: null }; },
    }),
  });
  return { client, rows, setOffline: v => { offline = v; } };
}
const reset = () => store.clear();

test("a different user on the same browser never receives the previous user's cache", async () => {
  reset(); const c = cloud();
  await saveWithClient(c.client("A"), "hq:kesef:v1", { secret: "A's finances" });
  const seenByB = await loadWithClient(c.client("B"), "hq:kesef:v1");
  assert.equal(seenByB, null);
  assert.equal(c.rows.has("B|hq:kesef:v1"), false); // וגם לא נכתב לענן תחת B
});

test("each user keeps their own offline copy, even when they alternate on one device", async () => {
  reset(); const c = cloud();
  await saveWithClient(c.client("A"), "k", { who: "A" });
  await saveWithClient(c.client("B"), "k", { who: "B" });
  c.setOffline(true);
  assert.deepEqual(await loadWithClient(c.client("A"), "k"), { who: "A" });
  assert.deepEqual(await loadWithClient(c.client("B"), "k"), { who: "B" });
});

test("a logged-in user never reads the old shared (unscoped) key", async () => {
  reset(); const c = cloud();
  store.set("k", JSON.stringify({ leftover: "from the pre-fix era or another user" }));
  assert.equal(await loadWithClient(c.client("A"), "k"), null);
});

test("without a session the local-only mode still works and never touches the network", async () => {
  reset(); const c = cloud();
  const noNet = { auth: { getSession: async () => ({ data: { session: null } }) }, from: () => { throw new Error("network must not be used"); } };
  assert.deepEqual(await saveWithClient(noNet, "k", { a: 1 }), { synced: false, reason: "no-session" });
  assert.deepEqual(await loadWithClient(noNet, "k"), { a: 1 });
  assert.equal(store.has(localKey("k", null)), true);
  assert.ok(c);
});

test("local copy is written before the cloud call and survives a cloud failure", async () => {
  reset(); const c = cloud(); c.setOffline(true);
  const result = await saveWithClient(c.client("A"), "k", { keep: true });
  assert.equal(result.synced, false);
  assert.equal(result.reason, "cloud-error");
  assert.deepEqual(JSON.parse(store.get(localKey("k", "A"))), { keep: true });
});

test("the cloud remains the source of truth and refreshes the user's own cache", async () => {
  reset(); const c = cloud();
  c.rows.set("A|k", { fromCloud: 1 });
  assert.deepEqual(await loadWithClient(c.client("A"), "k"), { fromCloud: 1 });
  assert.deepEqual(JSON.parse(store.get(localKey("k", "A"))), { fromCloud: 1 });
});

test("a user's own unsynced local copy is still uploaded when the cloud has no row yet", async () => {
  reset(); const c = cloud();
  store.set(localKey("k", "A"), JSON.stringify({ mine: 1 }));
  assert.deepEqual(await loadWithClient(c.client("A"), "k"), { mine: 1 });
  assert.deepEqual(c.rows.get("A|k"), { mine: 1 });
});
