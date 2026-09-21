import assert from "node:assert/strict";
import test from "node:test";

// Issue #7: מסמכי בית חדש נשמרים תחת ה-workspace המשותף (<workspaceId>/...), לא בתיקייה לפי משתמש.
const docs = await import("../lib/home-documents.js");

const SHARED = "11111111-1111-4111-8111-111111111111";
const USERS = ["user-liron", "user-lior", "user-shaked"];

// לקוח של חבר מסוים: אותה שורת workspace משותפת לכולם.
// נגיעה ב-auth.getUser (כלומר בחירת תיקייה לפי המשתמש המחובר) מפילה את הבדיקה.
const memberClient = (userId, uploads = []) => ({
  auth: { getUser: async () => { throw new Error(`auth.getUser must not be used to pick the storage folder (${userId})`); } },
  from: table => {
    assert.equal(table, "workspaces");
    return { select: () => ({ eq: (col, val) => { assert.deepEqual([col, val], ["kind", "shared"]); return { limit: async () => ({ data: [{ id: SHARED, owner_id: "owner-1" }], error: null }) }; } }) };
  },
  storage: { from: () => ({ upload: async path => { uploads.push(path); return { error: null }; } }) },
});

test("different members resolve to the same shared workspaceId, never their own user id", async () => {
  const results = await Promise.all(USERS.map(u => docs.createHomeDocuments(memberClient(u)).resolveWorkspaceId()));
  for (const r of results) assert.deepEqual(r, { ok: true, workspaceId: SHARED, ownerId: "owner-1" });
});

test("object path is <workspaceId>/<id>-<name> and no per-user folder is ever produced", async () => {
  const uploads = [];
  for (const user of USERS) {
    const api = docs.createHomeDocuments(memberClient(user, uploads));
    const ws = await api.resolveWorkspaceId();
    const path = docs.objectPath(ws.workspaceId, `id-${user}`, "invoice.pdf");
    assert.equal(path, `${SHARED}/id-${user}-invoice.pdf`);
    assert.deepEqual(await api.upload(path, {}, "application/pdf"), { ok: true });
  }
  assert.equal(uploads.length, USERS.length);
  for (const p of uploads) {
    assert.equal(p.split("/").length, 2);
    assert.equal(p.split("/")[0], SHARED);
    assert.ok(!p.startsWith("user-"), p);
  }
});

test("not enabled yet (no shared workspace row): resolve fails closed, so no path can be built", async () => {
  const noRow = {
    from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
    auth: { getUser: async () => ({ data: { user: { id: "user-liron" } } }) },
  };
  const r = await docs.createHomeDocuments(noRow).resolveWorkspaceId();
  assert.deepEqual(r, { ok: false, code: "not_enabled" });
  assert.equal("workspaceId" in r, false);
  assert.equal(docs.messageFor(r.code), "אחסון הקבצים עדיין לא הופעל בחשבון הזה");
});

test("source guard: resolveWorkspaceId does not use the signed-in user id as folder", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../lib/home-documents.js", import.meta.url), "utf8");
  assert.ok(!/auth\.getUser/.test(src));
  assert.match(src, /from\("workspaces"\)/);
});
