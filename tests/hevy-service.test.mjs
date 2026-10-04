import { test } from "node:test";
import assert from "node:assert/strict";
import { createHevyService, HevyError } from "../lib/hevy-service.mjs";

const FAKE_KEY = "hevy_fake_key_for_tests_only"; // מפתח מזויף בלבד - לעולם לא מפתח Hevy אמיתי בבדיקות

test("testConnection: שולח api-key בכותרת ל-/v1/user/info בלבד, ומחזיר רק username", async () => {
  let calledUrl = null, calledHeaders = null;
  const service = createHevyService({
    fetcher: async (url, init) => { calledUrl = url; calledHeaders = init.headers; return Response.json({ data: { id: "x", username: "jhon", name: "John" } }); },
  });
  const result = await service.testConnection(FAKE_KEY);
  assert.equal(result.username, "jhon");
  assert.ok(new URL(calledUrl).hostname.endsWith("hevyapp.com"));
  assert.equal(new URL(calledUrl).pathname, "/v1/user/info");
  assert.equal(calledHeaders["api-key"], FAKE_KEY);
});

test("testConnection: 401/403/404 ממופים ל-invalid_key, לעולם לא חושפים את גוף התשובה של Hevy", async () => {
  for (const status of [401, 403, 404]) {
    const service = createHevyService({ fetcher: async () => Response.json({ secret: "account details" }, { status }) });
    await assert.rejects(service.testConnection(FAKE_KEY), e => e instanceof HevyError && e.code === "invalid_key" && !e.message.includes("account details"));
  }
});

test("testConnection: 429 -> rate_limited, 5xx -> unavailable, רשת נכשלת -> network_error", async () => {
  const rateLimited = createHevyService({ fetcher: async () => new Response("", { status: 429 }) });
  await assert.rejects(rateLimited.testConnection(FAKE_KEY), e => e.code === "rate_limited");

  const serverError = createHevyService({ fetcher: async () => new Response("", { status: 500 }) });
  await assert.rejects(serverError.testConnection(FAKE_KEY), e => e.code === "unavailable");

  const networkDown = createHevyService({ fetcher: async () => { throw new Error("boom"); } });
  await assert.rejects(networkDown.testConnection(FAKE_KEY), e => e.code === "network_error");
});

test("fetchWorkouts: מדפדף עד page_count, ממפה רק שדות בטוחים (לא מעתיק routine_id/notes גולמיים)", async () => {
  const page1 = { page: 1, page_count: 2, workouts: [{ id: "w1", title: "בוקר", start_time: "2026-09-01T08:00:00Z", exercises: [{ title: "לחיצת חזה", sets: [{ reps: 10, weight_kg: 60 }] }] }] };
  const page2 = { page: 2, page_count: 2, workouts: [{ id: "w2", title: "ערב", start_time: "2026-09-03T18:00:00Z", exercises: [] }] };
  let calls = 0;
  const service = createHevyService({ fetcher: async url => { calls += 1; const u = new URL(url); return Response.json(u.searchParams.get("page") === "1" ? page1 : page2); } });
  const workouts = await service.fetchWorkouts(FAKE_KEY);
  assert.equal(calls, 2);
  assert.deepEqual(workouts, [
    { hevySourceId: "w1", title: "בוקר", date: "2026-09-01", exercises: [{ name: "לחיצת חזה", sets: [{ reps: 10, weightKg: 60 }] }] },
    { hevySourceId: "w2", title: "ערב", date: "2026-09-03", exercises: [] },
  ]);
});

test("fetchWorkouts: נעצר בתקרה (MAX_WORKOUTS) גם אם יש עוד עמודים - לא שולף הכול בלי גבול", async () => {
  let calls = 0;
  const bigPage = () => ({ page: ++calls, page_count: 999, workouts: Array.from({ length: 10 }, (_, i) => ({ id: `w${calls}-${i}`, title: "אימון", start_time: "2026-09-01T08:00:00Z" })) });
  const service = createHevyService({ fetcher: async () => Response.json(bigPage()) });
  const workouts = await service.fetchWorkouts(FAKE_KEY);
  assert.equal(workouts.length, 50); // MAX_WORKOUTS
  assert.equal(calls, 5); // 5 עמודים * 10 = 50, נעצר בדיוק שם
});

test("fetchWorkouts: פריט בלי id תקין לא נכנס, אין קריסה על exercises/sets חסרים", async () => {
  const service = createHevyService({ fetcher: async () => Response.json({ page: 1, page_count: 1, workouts: [{ title: "בלי id" }, { id: "ok1", title: "תקין" }, null] }) });
  const workouts = await service.fetchWorkouts(FAKE_KEY);
  assert.equal(workouts.length, 1);
  assert.equal(workouts[0].hevySourceId, "ok1");
  assert.deepEqual(workouts[0].exercises, []);
});
