import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createHevyConnectHandler, createHevyStatusHandler, createHevyTestHandler,
  createHevyDisconnectHandler, createHevyImportHandler,
} from "../lib/hevy-handler.mjs";
import { HevyError } from "../lib/hevy-service.mjs";
import { sealHevyKey } from "../lib/hevy-key.mjs";

const SECRET = "a".repeat(64);
const BAD_SECRET = "not-valid";
const USER = "11111111-1111-1111-1111-111111111111";
const OTHER_USER = "22222222-2222-2222-2222-222222222222";

/** admin מזויף, אותו דפוס כמו tests/hevy-store.test.mjs. */
function fakeAdmin(rows = {}) {
  return {
    rows,
    from() {
      return {
        select: () => ({ eq: (_c, userId) => ({ maybeSingle: async () => ({ data: rows[userId] || null, error: null }) }) }),
        upsert: async row => { rows[row.user_id] = { ...rows[row.user_id], ...row }; return { error: null }; },
        update: patch => ({ eq: async (_c, userId) => { if (!rows[userId]) return { error: new Error("not found") }; rows[userId] = { ...rows[userId], ...patch }; return { error: null }; } }),
        delete: () => ({ eq: async (_c, userId) => { delete rows[userId]; return { error: null }; } }),
      };
    },
  };
}

const allowGuard = async () => ({ ok: true, user: { id: USER } });
const denyGuard = status => async () => ({ ok: false, response: Response.json({ error: "x" }, { status }) });
const req = (body) => new Request("https://app.test/api/health/hevy/x", { method: "POST", body: body != null ? JSON.stringify(body) : undefined });
const reqGet = () => new Request("https://app.test/api/health/hevy/status", { method: "GET" });

// ---------- connect ----------

test("connect: guard-first - אימות נכשל לעולם לא מגיע ל-service/DB", async () => {
  let calls = 0;
  const h = createHevyConnectHandler({ guard: denyGuard(401), getEncryptionSecret: () => SECRET, getAdmin: async () => fakeAdmin(), service: { testConnection: async () => { calls++; } } });
  const res = await h(req({ apiKey: "x" }));
  assert.equal(res.status, 401);
  assert.equal(calls, 0);
});

test("connect: secret לא מוגדר/לא תקין -> 503 not_configured, לפני כל גישה ל-DB/Hevy", async () => {
  let calls = 0;
  const h = createHevyConnectHandler({ guard: allowGuard, getEncryptionSecret: () => BAD_SECRET, getAdmin: async () => { calls++; return fakeAdmin(); }, service: { testConnection: async () => { calls++; } } });
  const res = await h(req({ apiKey: "x" }));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, "not_configured");
  assert.equal(calls, 0);
});

test("connect: מפתח לא תקין (נכשל מול Hevy) - לא נשמר כלום, גם לא מוצפן", async () => {
  const admin = fakeAdmin();
  const h = createHevyConnectHandler({
    guard: allowGuard, getEncryptionSecret: () => SECRET, getAdmin: async () => admin,
    service: { testConnection: async () => { throw new HevyError("invalid_key", "לא תקין"); } },
  });
  const res = await h(req({ apiKey: "bad-key" }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "invalid_key");
  assert.equal(admin.rows[USER], undefined); // שום דבר לא נשמר
});

test("connect: מפתח תקין - נבדק מול Hevy קודם, ואז נשמר מוצפן (לא בטקסט גלוי)", async () => {
  const admin = fakeAdmin();
  let tested = null;
  const h = createHevyConnectHandler({
    guard: allowGuard, getEncryptionSecret: () => SECRET, getAdmin: async () => admin,
    service: { testConnection: async key => { tested = key; return { username: "jhon" }; } },
  });
  const res = await h(req({ apiKey: "real-hevy-key-123" }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { connected: true });
  assert.equal(tested, "real-hevy-key-123");
  assert.ok(admin.rows[USER].encrypted_api_key);
  assert.ok(!admin.rows[USER].encrypted_api_key.includes("real-hevy-key-123"));
  assert.equal(admin.rows[USER].last_check_ok, true);
});

test("connect: גוף לא תקין (בלי apiKey, או ריק) נדחה לפני כל קריאה ל-service", async () => {
  let calls = 0;
  const h = createHevyConnectHandler({ guard: allowGuard, getEncryptionSecret: () => SECRET, getAdmin: async () => fakeAdmin(), service: { testConnection: async () => { calls++; } } });
  for (const body of [{}, { apiKey: "" }, { apiKey: 5 }, { apiKey: "x".repeat(600) }]) {
    const res = await h(req(body));
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal(calls, 0);
});

// ---------- status ----------

test("status: לא מוגדר (secret חסר) -> 200 שקוף {configured:false}, לא שגיאה מפחידה", async () => {
  const h = createHevyStatusHandler({ guard: allowGuard, getEncryptionSecret: () => BAD_SECRET, getAdmin: async () => fakeAdmin() });
  const res = await h(reqGet());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { configured: false, connected: false });
});

test("status: לא מחובר / מחובר - לעולם לא כולל encrypted_api_key בתשובה", async () => {
  const admin = fakeAdmin();
  const h = createHevyStatusHandler({ guard: allowGuard, getEncryptionSecret: () => SECRET, getAdmin: async () => admin });
  const notConnected = await (await h(reqGet())).json();
  assert.deepEqual(notConnected, { configured: true, connected: false, lastCheckedAt: null, lastCheckOk: null });

  admin.rows[USER] = { user_id: USER, encrypted_api_key: "sealed-secret-blob", last_checked_at: "2026-10-01T00:00:00.000Z", last_check_ok: true };
  const body = await (await h(reqGet())).json();
  assert.equal(body.connected, true);
  assert.equal(body.lastCheckOk, true);
  assert.ok(!("encrypted_api_key" in body) && !("encryptedApiKey" in body) && !JSON.stringify(body).includes("sealed-secret-blob"));
});

test("status: שורה של משתמש אחר לעולם לא גלויה", async () => {
  const admin = fakeAdmin({ [OTHER_USER]: { user_id: OTHER_USER, encrypted_api_key: "other-blob", last_check_ok: true } });
  const h = createHevyStatusHandler({ guard: allowGuard, getEncryptionSecret: () => SECRET, getAdmin: async () => admin });
  const body = await (await h(reqGet())).json();
  assert.equal(body.connected, false);
});

// ---------- test (בדיקת חיבור פעילה) ----------

test("test: אין חיבור שמור -> 400 not_connected, לא קורא ל-Hevy בכלל", async () => {
  let calls = 0;
  const h = createHevyTestHandler({ guard: allowGuard, getEncryptionSecret: () => SECRET, getAdmin: async () => fakeAdmin(), service: { testConnection: async () => { calls++; } } });
  const res = await h(req());
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "not_connected");
  assert.equal(calls, 0);
});

test("test: חיבור תקין - מפענח ושולח ל-Hevy, מעדכן last_check_ok=true", async () => {
  const admin = fakeAdmin({ [USER]: { user_id: USER, encrypted_api_key: sealHevyKey("real-key", USER, SECRET) } });
  let sentKey = null;
  const h = createHevyTestHandler({ guard: allowGuard, getEncryptionSecret: () => SECRET, getAdmin: async () => admin, service: { testConnection: async k => { sentKey = k; return { username: "jhon" }; } } });
  const res = await h(req());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, username: "jhon" });
  assert.equal(sentKey, "real-key");
  assert.equal(admin.rows[USER].last_check_ok, true);
});

test("test: Hevy מחזיר שגיאה - ממופה כראוי ו-last_check_ok מתעדכן ל-false", async () => {
  const admin = fakeAdmin({ [USER]: { user_id: USER, encrypted_api_key: sealHevyKey("real-key", USER, SECRET) } });
  const h = createHevyTestHandler({ guard: allowGuard, getEncryptionSecret: () => SECRET, getAdmin: async () => admin, service: { testConnection: async () => { throw new HevyError("invalid_key", "לא תקין"); } } });
  const res = await h(req());
  assert.equal(res.status, 400);
  assert.equal(admin.rows[USER].last_check_ok, false);
});

test("test: ציפר-טקסט לא ניתן לפענוח (secret סובב) -> 502 decrypt_failed, לא קורס", async () => {
  const admin = fakeAdmin({ [USER]: { user_id: USER, encrypted_api_key: sealHevyKey("real-key", USER, "b".repeat(64)) } });
  const h = createHevyTestHandler({ guard: allowGuard, getEncryptionSecret: () => SECRET, getAdmin: async () => admin, service: { testConnection: async () => ({}) } });
  const res = await h(req());
  assert.equal(res.status, 502);
  assert.equal((await res.json()).code, "decrypt_failed");
});

// ---------- disconnect ----------

test("disconnect: מוחק את החיבור השמור, מחזיר {connected:false}", async () => {
  const admin = fakeAdmin({ [USER]: { user_id: USER, encrypted_api_key: "sealed" } });
  const h = createHevyDisconnectHandler({ guard: allowGuard, getAdmin: async () => admin });
  const res = await h(req());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { connected: false });
  assert.equal(admin.rows[USER], undefined);
});

// ---------- import ----------

test("import: אין חיבור שמור -> 400 not_connected", async () => {
  const h = createHevyImportHandler({ guard: allowGuard, getEncryptionSecret: () => SECRET, getAdmin: async () => fakeAdmin(), service: { fetchWorkouts: async () => [] } });
  const res = await h(req());
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "not_connected");
});

test("import: מחזיר את האימונים שחזרו מהשירות כ-Preview בלבד, לא שומר כלום בעצמו", async () => {
  const admin = fakeAdmin({ [USER]: { user_id: USER, encrypted_api_key: sealHevyKey("real-key", USER, SECRET) } });
  const workouts = [{ hevySourceId: "w1", title: "בוקר", date: "2026-10-01", exercises: [] }];
  const h = createHevyImportHandler({ guard: allowGuard, getEncryptionSecret: () => SECRET, getAdmin: async () => admin, service: { fetchWorkouts: async () => workouts } });
  const res = await h(req());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { workouts });
  assert.equal(admin.rows[USER].last_check_ok, true);
});

test("import: שגיאת Hevy ממופה כראוי", async () => {
  const admin = fakeAdmin({ [USER]: { user_id: USER, encrypted_api_key: sealHevyKey("real-key", USER, SECRET) } });
  const h = createHevyImportHandler({ guard: allowGuard, getEncryptionSecret: () => SECRET, getAdmin: async () => admin, service: { fetchWorkouts: async () => { throw new HevyError("rate_limited", "יותר מדי"); } } });
  const res = await h(req());
  assert.equal(res.status, 429);
  assert.equal(admin.rows[USER].last_check_ok, false);
});

test("כל ה-handlers: שגיאה לא-צפויה מה-service מסתיימת ב-500 גנרי, לא חושפת פרטים", async () => {
  const admin = fakeAdmin({ [USER]: { user_id: USER, encrypted_api_key: sealHevyKey("real-key", USER, SECRET) } });
  const h = createHevyTestHandler({ guard: allowGuard, getEncryptionSecret: () => SECRET, getAdmin: async () => admin, service: { testConnection: async () => { throw new Error("SECRET internal detail"); } } });
  const res = await h(req());
  assert.equal(res.status, 500);
  assert.doesNotMatch(await res.text(), /SECRET internal detail/);
});
