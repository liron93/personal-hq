import { test } from "node:test";
import assert from "node:assert/strict";
import { getHevyConnection, saveHevyConnection, recordHevyCheck, removeHevyConnection } from "../lib/hevy-store.mjs";

/** admin מזויף בסגנון ה-query builder של supabase-js, בלי שום רשת/DB אמיתיים. */
function fakeAdmin(rows = {}) {
  return {
    rows,
    from() {
      return {
        select: () => ({
          eq: (_col, userId) => ({
            maybeSingle: async () => ({ data: rows[userId] || null, error: null }),
          }),
        }),
        upsert: async row => { rows[row.user_id] = { ...rows[row.user_id], ...row }; return { error: null }; },
        update: patch => ({
          eq: async (_col, userId) => {
            if (!rows[userId]) return { error: new Error("not found") };
            rows[userId] = { ...rows[userId], ...patch };
            return { error: null };
          },
        }),
        delete: () => ({
          eq: async (_col, userId) => { delete rows[userId]; return { error: null }; },
        }),
      };
    },
  };
}

const USER = "11111111-1111-1111-1111-111111111111";

test("getHevyConnection: null כשאין שורה, אחרת רק השדות הציבוריים (לא עמודות פנימיות)", async () => {
  const admin = fakeAdmin();
  assert.equal(await getHevyConnection(admin, USER), null);
  admin.rows[USER] = { user_id: USER, encrypted_api_key: "sealed-blob", created_at: "2026-10-01T00:00:00.000Z", last_checked_at: "2026-10-02T00:00:00.000Z", last_check_ok: true };
  assert.deepEqual(await getHevyConnection(admin, USER), { encryptedApiKey: "sealed-blob", connectedAt: "2026-10-01T00:00:00.000Z", lastCheckedAt: "2026-10-02T00:00:00.000Z", lastCheckOk: true });
});

test("saveHevyConnection: upsert עם last_check_ok=true תמיד (נשמר רק אחרי שהמפתח כבר אומת)", async () => {
  const admin = fakeAdmin();
  const ok = await saveHevyConnection(admin, USER, "sealed-blob");
  assert.equal(ok, true);
  assert.equal(admin.rows[USER].encrypted_api_key, "sealed-blob");
  assert.equal(admin.rows[USER].last_check_ok, true);
});

test("recordHevyCheck: מעדכן last_checked_at/last_check_ok בלבד, לא נוגע במפתח; false אם השורה לא קיימת", async () => {
  const admin = fakeAdmin({ [USER]: { user_id: USER, encrypted_api_key: "sealed-blob" } });
  const ok = await recordHevyCheck(admin, USER, false);
  assert.equal(ok, true);
  assert.equal(admin.rows[USER].last_check_ok, false);
  assert.equal(admin.rows[USER].encrypted_api_key, "sealed-blob"); // המפתח לא נגע
  assert.equal(await recordHevyCheck(fakeAdmin(), USER, true), false);
});

test("removeHevyConnection: מוחק את השורה", async () => {
  const admin = fakeAdmin({ [USER]: { user_id: USER } });
  assert.equal(await removeHevyConnection(admin, USER), true);
  assert.equal(admin.rows[USER], undefined);
});
