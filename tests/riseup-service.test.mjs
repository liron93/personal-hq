import { test } from "node:test";
import assert from "node:assert/strict";
import { getRiseupKey, isRiseupConfigured } from "../lib/riseup-key.mjs";
import { createRiseupService, categorizeUpstreamStatus, computeLocalFingerprint, ERROR_CATEGORIES, isValidBudgetDate, RiseupError } from "../lib/riseup-service.mjs";
import { createRiseupHandler } from "../lib/riseup-handler.mjs";

// טוקנים מזויפים בלבד, בצורה שברור שאינה אמיתית. לעולם לא RISEUP_PAT אמיתי בבדיקות.
const FAKE_TOKEN = "riseup_pat_faketoken_for_tests_only";
const ROW = { customerId: 1, budgetDate: "2026-09", lastUpdatedAt: "2026-09-20T10:00:00Z", cashflowHash: "hash-1", envelopes: [] };

test("lib/riseup-key.mjs: not-configured is a normal handled state, never throws", () => {
  assert.equal(getRiseupKey({}), null);
  assert.equal(getRiseupKey({ RISEUP_PAT: "" }), null);
  assert.equal(getRiseupKey({ RISEUP_PAT: "   " }), null);
  assert.equal(isRiseupConfigured({}), false);
  assert.equal(getRiseupKey({ RISEUP_PAT: `  ${FAKE_TOKEN}  ` }), FAKE_TOKEN);
  assert.equal(isRiseupConfigured({ RISEUP_PAT: FAKE_TOKEN }), true);
});

test("categorizeUpstreamStatus / isValidBudgetDate", () => {
  assert.equal(categorizeUpstreamStatus(200), null);
  assert.equal(categorizeUpstreamStatus(401), ERROR_CATEGORIES.TOKEN_INVALID);
  assert.equal(categorizeUpstreamStatus(403), ERROR_CATEGORIES.SCOPE_INSUFFICIENT);
  assert.equal(categorizeUpstreamStatus(400), ERROR_CATEGORIES.INVALID_REQUEST);
  assert.equal(categorizeUpstreamStatus(404), ERROR_CATEGORIES.NOT_FOUND);
  assert.equal(categorizeUpstreamStatus(429), ERROR_CATEGORIES.RATE_LIMITED);
  assert.equal(categorizeUpstreamStatus(500), ERROR_CATEGORIES.UPSTREAM_ERROR);
  assert.equal(categorizeUpstreamStatus(503), ERROR_CATEGORIES.UPSTREAM_ERROR);
  assert.ok(isValidBudgetDate("current"));
  assert.ok(isValidBudgetDate("previous"));
  assert.ok(isValidBudgetDate("2026-09"));
  assert.ok(!isValidBudgetDate("2026-13"));
  assert.ok(!isValidBudgetDate("../secret"));
  assert.ok(!isValidBudgetDate(""));
});

test("service: never calls the real input.riseup.co.il host (fetcher always injected)", async () => {
  const service = createRiseupService({ fetcher: async url => { assert.notEqual(new URL(url).hostname, "input.riseup.co.il"); return Response.json(ROW); }, baseUrl: "https://fake-riseup.test" });
  await service(FAKE_TOKEN, {});
});

test("service: 401/403/400/404/5xx mapped to Hebrew categories, token never in output", async () => {
  for (const [status, category] of [[401, ERROR_CATEGORIES.TOKEN_INVALID], [403, ERROR_CATEGORIES.SCOPE_INSUFFICIENT], [400, ERROR_CATEGORIES.INVALID_REQUEST], [404, ERROR_CATEGORIES.NOT_FOUND], [500, ERROR_CATEGORIES.UPSTREAM_ERROR], [503, ERROR_CATEGORIES.UPSTREAM_ERROR]]) {
    const service = createRiseupService({ fetcher: async () => new Response(status === 400 ? JSON.stringify({ error: "some unstable validation detail" }) : "", { status, headers: { "X-Riseup-Token-Ref": "ref-xyz" } }) });
    await assert.rejects(service(FAKE_TOKEN, {}), e => {
      assert.ok(e instanceof RiseupError);
      assert.equal(e.category, category);
      assert.ok(!e.message.includes(FAKE_TOKEN));
      assert.ok(!e.message.includes("unstable validation detail")); // 400: body לא מוצג ללקוח - הוחלט לטפל גנרית
      return true;
    });
  }
});

test("service: 429 surfaces retryAfterSeconds from JSON body, falls back to Retry-After header", async () => {
  const withBody = createRiseupService({ fetcher: async () => Response.json({ error: "rate_limit_exceeded", window: "minute", retryAfterSeconds: 42 }, { status: 429 }) });
  await assert.rejects(withBody(FAKE_TOKEN, {}), e => {
    assert.equal(e.category, ERROR_CATEGORIES.RATE_LIMITED);
    assert.equal(e.retryAfterSeconds, 42);
    assert.match(e.message, /42/);
    return true;
  });
  const headerOnly = createRiseupService({ fetcher: async () => new Response("not json", { status: 429, headers: { "Retry-After": "17" } }) });
  await assert.rejects(headerOnly(FAKE_TOKEN, {}), e => { assert.equal(e.retryAfterSeconds, 17); return true; });
  const neither = createRiseupService({ fetcher: async () => new Response("", { status: 429 }) });
  await assert.rejects(neither(FAKE_TOKEN, {}), e => { assert.equal(e.retryAfterSeconds, 60); return true; }); // ברירת מחדל סבירה
});

test("service: malformed JSON on 200 is upstream_error, not a crash", async () => {
  const service = createRiseupService({ fetcher: async () => new Response("<not json>", { status: 200 }) });
  await assert.rejects(service(FAKE_TOKEN, {}), e => e.category === ERROR_CATEGORIES.UPSTREAM_ERROR);
});

test("service: network error and timeout both map to network_error, no automatic retry loop", async () => {
  let calls = 0;
  const network = createRiseupService({ fetcher: async () => { calls++; throw new TypeError("fetch failed"); } });
  await assert.rejects(network(FAKE_TOKEN, {}), e => e.category === ERROR_CATEGORIES.NETWORK_ERROR);
  assert.equal(calls, 1);

  const timeout = createRiseupService({ fetcher: async (url, init) => new Promise((_resolve, reject) => {
    const fail = () => reject(new DOMException("timeout", "TimeoutError"));
    if (init.signal.aborted) fail(); else init.signal.addEventListener("abort", fail);
  }), timeoutMs: 5 });
  await assert.rejects(timeout(FAKE_TOKEN, {}), e => e.category === ERROR_CATEGORIES.NETWORK_ERROR);
});

test("service: rejects invalid month before any fetch", async () => {
  let calls = 0;
  const service = createRiseupService({ fetcher: async () => { calls++; return Response.json(ROW); } });
  await assert.rejects(service(FAKE_TOKEN, { month: "not-a-month" }), e => e.category === ERROR_CATEGORIES.INVALID_REQUEST);
  assert.equal(calls, 0);
});

test("service: happy path returns normalized shape and logs only status+token-ref (never the token)", async () => {
  const logs = [];
  const originalWarn = console.warn;
  console.warn = (...args) => logs.push(args.join(" "));
  try {
    const service = createRiseupService({ fetcher: async () => Response.json({ ...ROW, envelopes: [{ id: "e1", type: "fixed", originalAmount: -100, balancedAmount: -80, balanceDate: "2026-09-20" }] }, { headers: { "X-Riseup-Token-Ref": "ref-abc123" } }) });
    const result = await service(FAKE_TOKEN, { month: "current" });
    assert.equal(result.cashflowHash, "hash-1");
    assert.equal(result.envelopes[0].id, "e1");
    assert.ok(logs.some(l => l.includes("ref-abc123")));
    assert.ok(!logs.some(l => l.includes(FAKE_TOKEN)));
  } finally {
    console.warn = originalWarn;
  }
});

test("service: logs field-names-only shape of envelope actuals/_meta/excluded, never a real value", async () => {
  const logs = [];
  const originalWarn = console.warn;
  console.warn = (...args) => logs.push(args.join(" "));
  try {
    const FAKE_MERCHANT = "בית קפה דמיוני בע\"מ"; // שם עסק מזויף - לעולם לא אמור להופיע בלוג
    const FAKE_AMOUNT = 123.45; // סכום מזויף - לעולם לא אמור להופיע בלוג
    const body = {
      ...ROW,
      // actuals הוא שדה בתוך כל envelope בנפרד, לא ברמת הגוף העליונה - ראו REAL_SHAPE_ROW למטה.
      envelopes: [{ id: "e1", type: "fixed", originalAmount: -100, balancedAmount: -80, actuals: [{ merchant: FAKE_MERCHANT, amount: FAKE_AMOUNT, date: "2026-09-15", category: "סופר" }] }],
      _meta: { unknownField: "x" },
      excluded: [],
    };
    const service = createRiseupService({ fetcher: async () => Response.json(body) });
    await service(FAKE_TOKEN, {});
    const shapeLog = logs.find(l => l.includes("[riseup:shape]"));
    assert.ok(shapeLog, "expected a [riseup:shape] log line");
    assert.match(shapeLog, /envelopeActuals=array\[1\]\{merchant,amount,date,category\}/);
    assert.match(shapeLog, /_meta=object\{unknownField\}/);
    assert.match(shapeLog, /excluded=array\[0\]/);
    // הבדיקה הקריטית: אף ערך אמיתי לא דלף ללוג, רק שמות השדות/הטיפוסים שלהם.
    assert.ok(!logs.some(l => l.includes(FAKE_MERCHANT)));
    assert.ok(!logs.some(l => l.includes(String(FAKE_AMOUNT))));
  } finally {
    console.warn = originalWarn;
  }
});

test("service: shape log handles missing/empty envelope actuals and missing _meta/excluded without crashing", async () => {
  const logs = [];
  const originalWarn = console.warn;
  console.warn = (...args) => logs.push(args.join(" "));
  try {
    const service = createRiseupService({ fetcher: async () => Response.json(ROW) }); // envelopes: [], בלי _meta/excluded בכלל
    await service(FAKE_TOKEN, {});
    const shapeLog = logs.find(l => l.includes("[riseup:shape]"));
    assert.match(shapeLog, /envelopeActuals=missing-on-all-envelopes _meta=missing excluded=missing/);
  } finally {
    console.warn = originalWarn;
  }
});

// ---- handler: סדר guard-first, מפתח לא מוגדר, ולידציית month, מיפוי סטטוסים ----

const denyGuard = status => async () => ({ ok: false, response: Response.json({ error: "x" }, { status }) });
const allowGuard = async () => ({ ok: true, user: { id: "u1" } });
const req = (url = "https://app.test/api/riseup/budget") => new Request(url);

test("handler: guard-first — auth failure never reaches the RiseUp service", async () => {
  for (const status of [401, 403, 429, 503]) {
    let serviceCalls = 0, keyReads = 0;
    const h = createRiseupHandler({ guard: denyGuard(status), getApiKey: () => { keyReads++; return FAKE_TOKEN; }, service: async () => { serviceCalls++; return ROW; } });
    const res = await h(req());
    assert.equal(res.status, status);
    assert.equal(serviceCalls, 0);
    assert.equal(keyReads, 0);
  }
});

test("handler: key not configured -> clear 503 response, service never invoked", async () => {
  let calls = 0;
  const h = createRiseupHandler({ guard: allowGuard, getApiKey: () => null, service: async () => { calls++; return ROW; } });
  const res = await h(req());
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.code, "not_configured");
  assert.equal(calls, 0);
});

test("handler: invalid ?month rejected before calling the service", async () => {
  let calls = 0;
  const h = createRiseupHandler({ guard: allowGuard, getApiKey: () => FAKE_TOKEN, service: async () => { calls++; return ROW; } });
  const res = await h(req("https://app.test/api/riseup/budget?month=nope"));
  assert.equal(res.status, 400);
  assert.equal(calls, 0);
});

test("handler: 200 happy path, no-store header, configured:true", async () => {
  const h = createRiseupHandler({ guard: allowGuard, getApiKey: () => FAKE_TOKEN, service: async () => ROW });
  const res = await h(req());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const body = await res.json();
  assert.equal(body.configured, true);
  assert.equal(body.cashflowHash, "hash-1");
});

test("handler: RiseupError categories map to HTTP status that doesn't collide with apiErrorMessage's own-app 401/403 handling", async () => {
  const cases = [
    [ERROR_CATEGORIES.TOKEN_INVALID, 503],
    [ERROR_CATEGORIES.SCOPE_INSUFFICIENT, 503],
    [ERROR_CATEGORIES.INVALID_REQUEST, 400],
    [ERROR_CATEGORIES.NOT_FOUND, 404],
    [ERROR_CATEGORIES.RATE_LIMITED, 429],
    [ERROR_CATEGORIES.UPSTREAM_ERROR, 502],
    [ERROR_CATEGORIES.NETWORK_ERROR, 502],
  ];
  for (const [category, expectedStatus] of cases) {
    const h = createRiseupHandler({ guard: allowGuard, getApiKey: () => FAKE_TOKEN, service: async () => { throw new RiseupError(category, "הודעה בעברית", { retryAfterSeconds: 5 }); } });
    const res = await h(req());
    assert.equal(res.status, expectedStatus, category);
    const body = await res.json();
    assert.equal(body.code, category);
    assert.equal(body.error, "הודעה בעברית");
  }
});

test("handler: unexpected non-RiseupError from service is sanitized to a generic 500, never leaked", async () => {
  const h = createRiseupHandler({ guard: allowGuard, getApiKey: () => FAKE_TOKEN, service: async () => { throw new Error("SECRET internal detail"); } });
  const res = await h(req());
  assert.equal(res.status, 500);
  assert.doesNotMatch(await res.text(), /SECRET/);
});

// --- הצורה האמיתית מפרודקשן (29.9.2026, ref 905bc4aae4a5bc53): אין cashflowHash, יש _meta/excluded
// לא-מתועדים, ולכל envelope יש actuals נוסף. ערכים בדויים בלבד - לא נתוני RiseUp אמיתיים.
const REAL_SHAPE_ROW = {
  customerId: 1, budgetDate: "2026-09", lastUpdatedAt: "2026-09-20T10:00:00Z",
  excluded: [], _meta: { requestId: "demo-fake" },
  envelopes: [
    { id: "e1", type: "fixed", originalAmount: -500, balancedAmount: -420, balanceDate: "2026-09-20", actuals: [] },
    { id: "e2", type: "variableIncome", originalAmount: 1000, balancedAmount: 1000, balanceDate: "2026-09-20", actuals: [] },
  ],
};

test("service: real production shape (no cashflowHash, extra _meta/excluded/actuals fields) is accepted, not rejected", async () => {
  const service = createRiseupService({ fetcher: async () => Response.json(REAL_SHAPE_ROW) });
  const result = await service(FAKE_TOKEN);
  assert.equal(result.customerId, 1);
  assert.equal(result.envelopes.length, 2);
  assert.ok(result.cashflowHash.startsWith("local:"), "falls back to a locally computed fingerprint");
});

test("computeLocalFingerprint: deterministic and order-independent", () => {
  const a = computeLocalFingerprint("2026-09", REAL_SHAPE_ROW.envelopes);
  const b = computeLocalFingerprint("2026-09", [...REAL_SHAPE_ROW.envelopes].reverse());
  assert.equal(a, b);
});

test("computeLocalFingerprint: changes when an amount changes (real change is detected, not masked)", () => {
  const a = computeLocalFingerprint("2026-09", REAL_SHAPE_ROW.envelopes);
  const changed = REAL_SHAPE_ROW.envelopes.map(e => e.id === "e1" ? { ...e, balancedAmount: -430 } : e);
  const b = computeLocalFingerprint("2026-09", changed);
  assert.notEqual(a, b);
});

test("service: a server-provided cashflowHash is still used as-is when present (no unnecessary local computation)", async () => {
  const service = createRiseupService({ fetcher: async () => Response.json(ROW) });
  const result = await service(FAKE_TOKEN);
  assert.equal(result.cashflowHash, "hash-1");
});
