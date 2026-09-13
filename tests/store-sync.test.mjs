import assert from "node:assert/strict";
import test from "node:test";

// lib/store.js טוענת את לקוח Supabase האמיתי (lib/supabase.js) בזמן import,
// וזה דורש NEXT_PUBLIC_SUPABASE_URL תקין כדי לא להיכשל מיד עם
// "supabaseUrl is required" — גם כשהבדיקות עצמן משתמשות ב-client מזויף
// (ראו saveWithClient/loadWithClient ב-lib/store.js) ולא נוגעות ברשת אמיתית.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "placeholder-anon-key";

const { saveWithClient } = await import("../lib/store.js");

function fakeClient({ session, upsert }) {
  return {
    auth: { getSession: async () => ({ data: { session } }) },
    from: () => ({ upsert }),
  };
}

test("save without a session never touches the network and reports local-only", async () => {
  const client = fakeClient({
    session: null,
    upsert: async () => { throw new Error("should never be called without a session"); },
  });
  const result = await saveWithClient(client, "career-v1", { jobs: [] });
  assert.deepEqual(result, { synced: false, reason: "no-session" });
});

test("save with a session and a successful upsert reports synced", async () => {
  const client = fakeClient({
    session: { user: { id: "user-1" } },
    upsert: async () => ({ error: null }),
  });
  const result = await saveWithClient(client, "career-v1", { jobs: [] });
  assert.deepEqual(result, { synced: true });
});

test("save with a session but a failed upsert reports a cloud-error, not a throw", async () => {
  const client = fakeClient({
    session: { user: { id: "user-1" } },
    upsert: async () => ({ error: new Error("network unreachable") }),
  });
  const result = await saveWithClient(client, "career-v1", { jobs: [] });
  assert.equal(result.synced, false);
  assert.equal(result.reason, "cloud-error");
  assert.equal(result.message, "network unreachable");
});

test("save with a session where the upsert call itself throws still resolves (never rejects)", async () => {
  const client = fakeClient({
    session: { user: { id: "user-1" } },
    upsert: async () => { throw new Error("connection reset"); },
  });
  await assert.doesNotReject(saveWithClient(client, "career-v1", { jobs: [] }));
  const result = await saveWithClient(client, "career-v1", { jobs: [] });
  assert.equal(result.synced, false);
  assert.equal(result.reason, "cloud-error");
});
