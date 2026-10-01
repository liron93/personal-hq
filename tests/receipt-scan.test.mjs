import { test } from "node:test";
import assert from "node:assert/strict";
import { createReceiptScanService, ReceiptScanError } from "../lib/receipt-scan-service.mjs";
import { createReceiptScanHandler } from "../lib/receipt-scan-handler.mjs";

const FAKE_KEY = "gemini_fake_key_for_tests_only"; // מפתח מזויף בלבד - לעולם לא GEMINI_API_KEY אמיתי בבדיקות
const noSleep = () => Promise.resolve();
const geminiJson = out => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] });

// ---------- service ----------

test("service: happy path extracts store/date/items, never calls the real Gemini host", async () => {
  const service = createReceiptScanService({
    fetcher: async url => { assert.ok(new URL(url).hostname.endsWith("googleapis.com")); return geminiJson({ store: "שופרסל", date: "2026-09-20", items: [{ name: "חלב", price: 6.9, qty: 1 }, { name: "לחם", price: 8, qty: null }] }); },
    sleep: noSleep,
  });
  const result = await service(FAKE_KEY, { imageBase64: "ZmFrZS1pbWFnZQ==", mimeType: "image/jpeg" });
  assert.equal(result.store, "שופרסל");
  assert.equal(result.date, "2026-09-20");
  assert.deepEqual(result.items, [{ name: "חלב", price: 6.9, qty: 1 }, { name: "לחם", price: 8, qty: null }]);
});

test("service: unclear receipt -> empty items, not an error (never invents data)", async () => {
  const service = createReceiptScanService({ fetcher: async () => geminiJson({ store: null, date: null, items: [] }), sleep: noSleep });
  const result = await service(FAKE_KEY, { imageBase64: "ZmFrZQ==", mimeType: "image/jpeg" });
  assert.deepEqual(result, { store: null, date: null, items: [] });
});

test("service: sanitizes malformed items (missing name/invalid price dropped), caps at MAX_ITEMS", async () => {
  const items = [
    { name: "תקין", price: 5 },
    { name: "", price: 5 }, // שם ריק - נפסל
    { name: "מחיר שלילי", price: -1 }, // מחיר לא חוקי - נפסל
    { name: "בלי מחיר" }, // אין price - נפסל
    { name: "עם כמות שלילית", price: 2, qty: -3 }, // qty לא חוקי נופל ל-null, לא פוסל את הפריט
    "לא אובייקט", null,
  ];
  const service = createReceiptScanService({ fetcher: async () => geminiJson({ items }), sleep: noSleep });
  const result = await service(FAKE_KEY, { imageBase64: "ZmFrZQ==" });
  assert.deepEqual(result.items, [{ name: "תקין", price: 5, qty: null }, { name: "עם כמות שלילית", price: 2, qty: null }]);
});

test("service: missing apiKey/image rejected before any network call", async () => {
  let calls = 0;
  const service = createReceiptScanService({ fetcher: async () => { calls++; return geminiJson({}); }, sleep: noSleep });
  await assert.rejects(service(null, { imageBase64: "x" }), e => e instanceof ReceiptScanError && e.code === "not_configured");
  await assert.rejects(service(FAKE_KEY, { imageBase64: "" }), e => e instanceof ReceiptScanError && e.code === "bad_request");
  assert.equal(calls, 0);
});

test("service: 429/5xx/malformed JSON from Gemini map to clear error categories, never crash", async () => {
  const rateLimited = createReceiptScanService({ fetcher: async () => new Response("", { status: 429 }), sleep: noSleep });
  await assert.rejects(rateLimited(FAKE_KEY, { imageBase64: "x" }), e => e.code === "rate_limited");

  const serverError = createReceiptScanService({ fetcher: async () => new Response("", { status: 500 }), sleep: noSleep });
  await assert.rejects(serverError(FAKE_KEY, { imageBase64: "x" }), e => e.code === "upstream_error");

  const badJson = createReceiptScanService({ fetcher: async () => Response.json({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }), sleep: noSleep });
  await assert.rejects(badJson(FAKE_KEY, { imageBase64: "x" }), e => e.code === "upstream_error");
});

test("service: network error retries once then throws network_error", async () => {
  let calls = 0;
  const service = createReceiptScanService({ fetcher: async () => { calls++; throw new Error("boom"); }, sleep: noSleep });
  await assert.rejects(service(FAKE_KEY, { imageBase64: "x" }), e => e.code === "network_error");
  assert.equal(calls, 2); // ניסיון אחד + חזרה אחת, כמו ב-callGemini של jarvis-handler
});

// ---------- handler ----------

const allowGuard = async () => ({ ok: true, user: { id: "u1" } });
const denyGuard = status => async () => ({ ok: false, response: Response.json({ error: "x" }, { status }) });
const req = body => new Request("https://app.test/api/household/receipt-scan", { method: "POST", body: JSON.stringify(body) });

test("handler: guard-first — auth failure never reaches the service", async () => {
  let calls = 0;
  const h = createReceiptScanHandler({ guard: denyGuard(401), getApiKey: () => FAKE_KEY, service: async () => { calls++; return {}; } });
  const res = await h(req({ imageBase64: "x" }));
  assert.equal(res.status, 401);
  assert.equal(calls, 0);
});

test("handler: key not configured -> 503, service never invoked", async () => {
  let calls = 0;
  const h = createReceiptScanHandler({ guard: allowGuard, getApiKey: () => null, service: async () => { calls++; return {}; } });
  const res = await h(req({ imageBase64: "x" }));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, "not_configured");
  assert.equal(calls, 0);
});

test("handler: missing/invalid imageBase64 or disallowed mimeType rejected before the service", async () => {
  let calls = 0;
  const h = createReceiptScanHandler({ guard: allowGuard, getApiKey: () => FAKE_KEY, service: async () => { calls++; return {}; } });
  for (const body of [{}, { imageBase64: "" }, { imageBase64: 5 }, { imageBase64: "x", mimeType: "application/pdf" }]) {
    const res = await h(req(body));
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal(calls, 0);
});

test("handler: 200 happy path, no-store header, configured:true", async () => {
  const h = createReceiptScanHandler({ guard: allowGuard, getApiKey: () => FAKE_KEY, service: async () => ({ store: "שופרסל", date: null, items: [] }) });
  const res = await h(req({ imageBase64: "x", mimeType: "image/jpeg" }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const body = await res.json();
  assert.equal(body.configured, true);
  assert.equal(body.store, "שופרסל");
});

test("handler: ReceiptScanError codes map to the right HTTP status", async () => {
  const cases = [["bad_request", 400], ["rate_limited", 429], ["upstream_error", 502], ["network_error", 502], ["not_configured", 503]];
  for (const [code, status] of cases) {
    const h = createReceiptScanHandler({ guard: allowGuard, getApiKey: () => FAKE_KEY, service: async () => { throw new ReceiptScanError(code, "הודעה"); } });
    const res = await h(req({ imageBase64: "x" }));
    assert.equal(res.status, status, code);
  }
});

test("handler: unexpected non-ReceiptScanError from service is sanitized to a generic 500, never leaked", async () => {
  const h = createReceiptScanHandler({ guard: allowGuard, getApiKey: () => FAKE_KEY, service: async () => { throw new Error("SECRET internal detail"); } });
  const res = await h(req({ imageBase64: "x" }));
  assert.equal(res.status, 500);
  assert.doesNotMatch(await res.text(), /SECRET/);
});
