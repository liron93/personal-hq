import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";

// כל הנתונים כאן סינתטיים ונוצרים בקוד. אף קובץ פיננסי אמיתי לא נכנס לריפו.
const cfgMod = await import("../lib/riseup-import/config.js");
const parse = await import("../lib/riseup-import/parse.js");
const norm = await import("../lib/riseup-import/normalize.js");
const dedupe = await import("../lib/riseup-import/dedupe.js");
const classify = await import("../lib/riseup-import/classify.js");
const previewMod = await import("../lib/riseup-import/preview.js");
const audit = await import("../lib/riseup-import/audit.js");
const { createPreviewHandler } = await import("../lib/riseup-import/handler.js");
const { createRateLimiter } = await import("../lib/riseup-import/rate-limit.js");
const serverAuth = await import("../lib/server-auth.js");
const { ImportError } = await import("../lib/riseup-import/errors.js");

const CFG = {
  columns: { date: "Date", description: "Description", amount: "Amount", category: "Category", account: "Account" },
  dateFormat: "DD/MM/YYYY", decimalSeparator: ".", expenseSign: "negative", categoryMap: { Groceries: "מזון" },
};
const UID = "11111111-1111-4111-8111-111111111111";
const enc = s => new TextEncoder().encode(s);
const csv = (lines, sep = ",") => lines.map(l => l.join(sep)).join("\r\n");
const HEADER = ["Date", "Description", "Amount", "Category", "Account", "Balance"];
const codeOf = fn => { try { fn(); } catch (e) { return e instanceof ImportError ? e.code : `other:${e.message}`; } return null; };
// windows-1255: אותיות עבריות 0x05D0..0x05EA → 0xE0..0xFA
const cp1255 = s => Uint8Array.from([...s].map(c => { const n = c.charCodeAt(0); return n >= 0x05d0 && n <= 0x05ea ? 0xe0 + (n - 0x05d0) : n; }));

test("config: validated mapping only, and unset until Riseup's real headers are confirmed", () => {
  assert.equal(cfgMod.RISEUP_IMPORT_CONFIG, null);
  assert.equal(cfgMod.isConfigured(), false);
  assert.equal(cfgMod.validateImportConfig(CFG).ok, true);
  assert.equal(cfgMod.validateImportConfig({ ...CFG, dateFormat: "MM/DD/YYYY" }).ok, false);
  assert.equal(cfgMod.validateImportConfig({ ...CFG, columns: { date: "A", description: "A", amount: "B" } }).ok, false); // עמודה כפולה
  assert.equal(cfgMod.validateImportConfig({ ...CFG, columns: { date: "D", description: "X", amount: "A", debit: "B", credit: "C" } }).ok, false);
  assert.equal(cfgMod.validateImportConfig({ ...CFG, columns: { date: "D", description: "X", debit: "B", credit: "C" }, expenseSign: undefined }).ok, true);
});

test("parse: quoted fields, embedded commas/newlines/quotes, delimiters, BOM, CRLF, blank lines", () => {
  const text = csv([HEADER, ["05/03/2026", '"Shop, ""A""\nbranch"', "-10.00", "", "", "1"], [], ["06/03/2026", "Plain", "5.5", "", "", "2"]]);
  const r = parse.readImportFile(enc("\ufeff" + text), CFG);
  assert.equal(r.encoding, "utf-8");
  assert.equal(r.records.length, 2);
  assert.equal(r.records[0].cells.description, 'Shop, "A"\nbranch');
  assert.deepEqual(r.ignoredColumns, ["Balance"]); // עמודות נוספות לא נשמרות
  assert.equal("Balance" in r.records[0].cells, false);
  const semi = parse.readImportFile(enc(csv([HEADER, ["05/03/2026", "x", "1", "", "", "0"]], ";")), CFG);
  assert.equal(semi.delimiter, ";");
  assert.equal(parse.readImportFile(enc(csv([HEADER])), CFG).records.length, 0);
});

test("parse: decodes windows-1255 and UTF-16 Hebrew text", () => {
  const line = csv([["Date", "Description", "Amount"], ["05/03/2026", "קפה", "-12.00"]]);
  const cfg = { ...CFG, columns: { date: "Date", description: "Description", amount: "Amount" } };
  const legacy = parse.readImportFile(cp1255(line), cfg);
  assert.equal(legacy.encoding, "windows-1255");
  assert.equal(legacy.records[0].cells.description, "קפה");
  const u16 = parse.readImportFile(new Uint8Array(Buffer.from("\ufeff" + line, "utf16le")), cfg);
  assert.equal(u16.encoding, "utf-16le");
  assert.equal(u16.records[0].cells.description, "קפה");
});

test("parse: rejects unsafe or unrecognised files with a stable code", () => {
  const ok = csv([HEADER, ["05/03/2026", "x", "1", "", "", "0"]]);
  assert.equal(codeOf(() => parse.readImportFile(new Uint8Array(0), CFG)), "empty_file");
  assert.equal(codeOf(() => parse.readImportFile(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2]), CFG)), "unsupported_format_xlsx");
  assert.equal(codeOf(() => parse.readImportFile(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]), CFG)), "unsupported_format");
  assert.equal(codeOf(() => parse.readImportFile(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0]), CFG)), "unsupported_format");
  assert.equal(codeOf(() => parse.readImportFile(Uint8Array.from([65, 0, 66, 0, 67]), CFG)), "binary_file");
  assert.equal(codeOf(() => parse.readImportFile(new Uint8Array(cfgMod.LIMITS.maxBytes + 1), CFG)), "too_large");
  assert.equal(codeOf(() => parse.readImportFile(enc('Date,Description,Amount\r\n05/03/2026,"open,1'), { ...CFG, columns: { date: "Date", description: "Description", amount: "Amount" } })), "malformed_csv");
  const many = ["Date,Description,Amount", ...Array.from({ length: cfgMod.LIMITS.maxRows + 1 }, () => "05/03/2026,x,1")].join("\n");
  assert.equal(codeOf(() => parse.readImportFile(enc(many), { ...CFG, columns: { date: "Date", description: "Description", amount: "Amount" } })), "too_many_rows");
  try { parse.readImportFile(enc(ok.replace("Amount", "Sum")), CFG); assert.fail("should throw"); } catch (e) { assert.equal(e.code, "unrecognized_headers"); assert.deepEqual(e.details.missing, ["amount"]); }
});

test("normalize amounts to integer agorot, unambiguously", () => {
  const p = norm.parseAmountToMinor;
  assert.equal(p("1,234.56"), 123456);
  assert.equal(p("-1,234.56"), -123456);
  assert.equal(p("(12.50)"), -1250);
  assert.equal(p("₪ 99"), 9900);
  assert.equal(p("12.5-"), -1250);
  assert.equal(p("−45.90"), -4590);
  assert.equal(p("0.05"), 5);
  assert.equal(p("1,234"), 123400);
  assert.equal(p("1.234,56", ","), 123456);
  assert.equal(p("12,5", ","), 1250);
  for (const bad of ["12.345.67", "12.345", "abc", "", "1,23", "1,2345", "9999999999999.00", "--5"]) assert.equal(p(bad), null, `should reject ${bad}`);
  assert.ok(Number.isInteger(p("0.29")) && p("0.29") === 29); // בלי שגיאות float
});

test("normalize dates: real calendar dates only, in the configured format", () => {
  const d = norm.parseDate;
  assert.equal(d("31/12/2025", "DD/MM/YYYY"), "2025-12-31");
  assert.equal(d("1/2/2026", "DD/MM/YYYY"), "2026-02-01");
  assert.equal(d("05/03/26", "DD/MM/YY"), "2026-03-05");
  assert.equal(d("05.03.2026", "DD.MM.YYYY"), "2026-03-05");
  assert.equal(d("2026-03-05", "YYYY-MM-DD"), "2026-03-05");
  assert.equal(d("05/03/2026 14:30", "DD/MM/YYYY"), "2026-03-05");
  for (const [v, f] of [["31/02/2026", "DD/MM/YYYY"], ["2026-02-30", "YYYY-MM-DD"], ["05/13/2026", "DD/MM/YYYY"], ["05/03/1899", "DD/MM/YYYY"], ["2026-03-05", "DD/MM/YYYY"], ["", "DD/MM/YYYY"]]) assert.equal(d(v, f), null, `${v} as ${f}`);
});

test("normalize rows: safe text, per-row error codes that never echo cell values", () => {
  const rec = (n, cells, extra = {}) => ({ rowNumber: n, cells: { date: "05/03/2026", description: "x", amount: "-1.00", ...cells }, columnMismatch: false, tooLong: false, ...extra });
  const SECRET = "SECRET-VALUE-123";
  const { rows, errors } = norm.normalizeRecords([
    rec(2, { description: '=HYPERLINK("http://evil")' }),
    rec(3, { description: "\u202eabc\u200f  d\u0007e" }),
    rec(4, { description: "y".repeat(500) }),
    rec(5, { amount: "-45.90", category: "Groceries", account: "IL12-3456-7890" }),
    rec(6, { date: SECRET }), rec(7, { amount: SECRET }), rec(8, { amount: "0" }), rec(9, { description: " \u200f " }),
    rec(10, {}, { tooLong: true }), rec(11, {}, { columnMismatch: true }),
  ], CFG);
  assert.equal(rows[0].description.startsWith("'="), true); // נוסחה מנוטרלת
  assert.equal(rows[1].description, "abc d e"); // תווי כיוון/בקרה הוסרו
  assert.equal(rows[2].description.length, cfgMod.LIMITS.maxDescriptionChars);
  assert.deepEqual([rows[3].amountMinor, rows[3].direction, rows[3].category, rows[3].account], [4590, "out", "מזון", "••••7890"]);
  assert.deepEqual(errors.map(e => [e.rowNumber, e.code]), [[6, "invalid_date"], [7, "invalid_amount"], [8, "zero_amount"], [9, "empty_description"], [10, "cell_too_long"], [11, "column_count_mismatch"]]);
  assert.equal(JSON.stringify(errors).includes(SECRET), false);
});

test("normalize: debit/credit columns and positive-expense convention", () => {
  const split = { ...CFG, columns: { date: "D", description: "X", debit: "Dr", credit: "Cr" }, expenseSign: undefined };
  const r = (n, cells) => ({ rowNumber: n, cells: { date: "05/03/2026", description: "x", ...cells }, columnMismatch: false, tooLong: false });
  const out = norm.normalizeRecords([r(2, { debit: "10.00", credit: "" }), r(3, { debit: "", credit: "2,500.00" }), r(4, { debit: "1", credit: "2" }), r(5, { debit: "", credit: "" })], split);
  assert.deepEqual(out.rows.map(x => [x.direction, x.amountMinor]), [["out", 1000], ["in", 250000]]);
  assert.deepEqual(out.errors.map(e => e.code), ["both_debit_and_credit", "zero_amount"]);
  const pos = norm.normalizeRecords([r(2, { amount: "30.00" })], { ...CFG, expenseSign: "positive" });
  assert.equal(pos.rows[0].direction, "out");
});

test("dedupe: deterministic, idempotent, identical same-day rows stay separate", () => {
  const base = [
    { date: "2026-03-05", amountMinor: 1200, direction: "out", description: "קפה", account: null },
    { date: "2026-03-05", amountMinor: 1200, direction: "out", description: "  קפה ", account: null },
    { date: "2026-03-06", amountMinor: 5000, direction: "in", description: "משכורת", account: null },
  ];
  const first = dedupe.assignFingerprints(base);
  assert.equal(new Set(first.map(r => r.fingerprint)).size, 3); // שתי קניות זהות = שתי תנועות
  assert.deepEqual(first.map(r => r.occurrence), [1, 2, 1]);
  assert.equal(dedupe.countIdenticalInFile(first), 1);
  assert.deepEqual(dedupe.assignFingerprints(base).map(r => r.fingerprint), first.map(r => r.fingerprint)); // יציב בין הרצות
  const existing = new Set(first.map(r => r.fingerprint));
  const again = dedupe.partitionByExisting(dedupe.assignFingerprints(base), existing);
  assert.equal(again.fresh.length, 0);
  assert.equal(again.duplicates.length, 3); // אותו קובץ פעמיים = 0 חדשות
  const overlap = dedupe.partitionByExisting(dedupe.assignFingerprints([...base, { date: "2026-03-07", amountMinor: 99, direction: "out", description: "חדש", account: null }]), existing);
  assert.deepEqual(overlap.fresh.map(r => r.description), ["חדש"]);
  assert.notEqual(dedupe.fingerprint({ ...base[0], amountMinor: 1201 }, 1), first[0].fingerprint);
});

test("classify: visible rules, unknown stays unclassified, disallowed categories are ignored", () => {
  const cats = cfgMod.BUDGET_CATEGORIES;
  const row = (description, extra = {}) => ({ direction: "out", category: null, description, ...extra });
  const out = classify.classifyRows([
    row("שופרסל סניף 12"), row("NETFLIX.COM"), row("חנות לא מוכרת"), row("שופרסל", { direction: "in" }), row("x", { category: "מזון" }), row("x", { category: "לא קיימת" }),
  ], { categories: cats });
  assert.deepEqual(out.map(r => [r.category, r.categorySource]), [["מזון", "rule:food"], ["מנויים", "rule:subscriptions"], [null, null], [null, null], ["מזון", "file"], [null, null]]);
  const limited = classify.classifyRows([row("שופרסל")], { categories: ["אחר"] });
  assert.equal(limited[0].category, null); // כלל לקטגוריה שלא מותרת לא חל
});

test("preview: draft only, counts and totals, capped errors, no raw cell values", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ rowNumber: i + 2, date: `2026-03-${String((i % 28) + 1).padStart(2, "0")}`, amountMinor: 1000 + i, direction: i % 5 ? "out" : "in", description: `d${i}`, category: null, categorySource: null, account: null, fingerprint: `f${i}` }));
  const errors = Array.from({ length: 60 }, (_, i) => ({ rowNumber: i + 2, field: "amount", code: "invalid_amount" }));
  const p = previewMod.buildPreview({ fresh: rows, duplicates: rows.slice(0, 2), errors, identicalInFile: 3, ignoredColumns: ["Balance"], encoding: "utf-8", fileBytes: enc("abc"), dedupedAgainstExisting: false });
  assert.equal(p.status, "draft"); assert.equal(p.saved, false);
  assert.equal(p.summary.new, 30); assert.equal(p.summary.duplicate, 2); assert.equal(p.summary.invalid, 60);
  assert.equal(p.sample.length, cfgMod.LIMITS.sampleRows);
  assert.equal(p.errors.length, cfgMod.LIMITS.maxErrorsReported); assert.equal(p.errorsTruncated, true);
  assert.match(p.fileSha256, /^[0-9a-f]{64}$/);
  assert.equal(p.dedupe.againstExisting, false);
  assert.equal(p.summary.dateRange.from <= p.summary.dateRange.to, true);
  assert.equal(p.summary.incomeTotal, rows.filter(r => r.direction === "in").reduce((s, r) => s + r.amountMinor, 0) / 100);
});

test("audit record holds who/when/hash/counts only, never row content", () => {
  const preview = { fileSha256: "a".repeat(64), summary: { new: 5, duplicate: 1, invalid: 0 }, sample: [{ description: "TOP-SECRET-MERCHANT" }] };
  const rec = audit.buildAuditRecord({ userId: "u1", preview, now: Date.parse("2026-09-20T10:00:00Z") });
  assert.deepEqual(Object.keys(rec).sort(), ["at", "counts", "fileSha256", "source", "userId"]);
  assert.equal(JSON.stringify(rec).includes("TOP-SECRET-MERCHANT"), false);
  assert.equal(rec.at, "2026-09-20T10:00:00.000Z");
});

test("server auth: deny by default, verifies the token with Supabase, anon key only", async () => {
  const calls = [];
  const createClient = (url, key, opts) => { calls.push({ url, key, opts }); return { auth: { getUser: async t => (t === "good.token" ? { data: { user: { id: UID, email: "a@b.c" } }, error: null } : { data: { user: null }, error: { message: "bad" } }) } }; };
  const auth = serverAuth.createAuthenticator({ createClient, url: "https://x.supabase.co", anonKey: "ANON" });
  const req = h => new Request("http://x", { headers: h });
  assert.equal((await auth(req({}))).ok, false);
  for (const bad of ["Basic abc", "Bearer", "Bearer  spaced", "bearer good.token", `Bearer ${"a".repeat(5000)}`]) assert.equal((await auth(req({ authorization: bad }))).ok, false, bad);
  assert.equal((await auth(req({ authorization: "Bearer other.token" }))).reason, "invalid_token");
  const ok = await auth(req({ authorization: "Bearer good.token" }));
  assert.deepEqual(ok, { ok: true, user: { id: UID, email: "a@b.c" } });
  assert.deepEqual(calls.map(c => c.key), ["ANON", "ANON"]);
  assert.equal(calls[0].opts.auth.persistSession, false);
  assert.equal((await serverAuth.createAuthenticator({ createClient, url: "", anonKey: "" })(req({ authorization: "Bearer good.token" }))).reason, "auth_not_configured");
  const throwing = serverAuth.createAuthenticator({ createClient: () => { throw new Error("net"); }, url: "u", anonKey: "k" });
  assert.equal((await throwing(req({ authorization: "Bearer good.token" }))).ok, false);
});

test("allowlist parsing fails closed", () => {
  assert.equal(serverAuth.parseAllowedUserIds(undefined).size, 0);
  assert.equal(serverAuth.parseAllowedUserIds("").size, 0);
  assert.equal(serverAuth.parseAllowedUserIds("not-a-uuid,").size, 0);
  assert.deepEqual([...serverAuth.parseAllowedUserIds(` ${UID} , junk`)], [UID]);
});

const fakeAuth = async req => (req.headers.get("authorization") === "Bearer good" ? { ok: true, user: { id: UID, email: null } } : { ok: false, reason: "invalid_token" });
function makeHandler(over = {}) {
  const audits = [];
  const handler = createPreviewHandler({ authenticate: fakeAuth, getConfig: () => CFG, getAllowedUserIds: () => new Set([UID]), limiter: createRateLimiter({ max: 100 }), onAudit: r => audits.push(r), ...over });
  return { handler, audits };
}
function upload(bytes, { auth = "Bearer good", name = "export.csv", field = "file" } = {}) {
  const fd = new FormData();
  if (bytes) fd.set(field, new File([bytes], name, { type: "text/csv" }));
  return new Request("http://localhost/api/kesef/import/preview", { method: "POST", body: fd, headers: auth ? { authorization: auth } : {} });
}
const goodCsv = () => enc(csv([HEADER, ["05/03/2026", "שופרסל", "-100.50", "", "IL12-3456-7890", "0"], ["06/03/2026", "משכורת", "15000", "", "", "0"], ["05/03/2026", "שופרסל", "-100.50", "", "IL12-3456-7890", "0"], ["31/02/2026", "bad", "1", "", "", "0"]]));

test("handler: authentication, authorization and rate limit come before anything is read", async () => {
  let bodyRead = false;
  const spy = { headers: new Headers(), formData: async () => { bodyRead = true; return new FormData(); } };
  const { handler } = makeHandler();
  const res = await handler(spy);
  assert.equal(res.status, 401);
  assert.equal(bodyRead, false); // לא קוראים גוף בלי אימות
  assert.equal((await handler(upload(goodCsv(), { auth: "Bearer wrong" }))).status, 401);
  assert.equal((await makeHandler({ getAllowedUserIds: () => new Set() }).handler(upload(goodCsv()))).status, 403); // רשימה ריקה = סגור
  assert.equal((await makeHandler({ getAllowedUserIds: () => new Set(["22222222-2222-4222-8222-222222222222"]) }).handler(upload(goodCsv()))).status, 403);
  let t = 0;
  const limited = makeHandler({ limiter: createRateLimiter({ max: 2, windowMs: 1000, now: () => t }) }).handler;
  assert.equal((await limited(upload(goodCsv()))).status, 200);
  assert.equal((await limited(upload(goodCsv()))).status, 200);
  const third = await limited(upload(goodCsv()));
  assert.equal(third.status, 429); assert.ok(Number(third.headers.get("retry-after")) >= 1);
  t = 1500;
  assert.equal((await limited(upload(goodCsv()))).status, 200);
});

test("handler: not configured, wrong content type, missing file, oversize, bad formats", async () => {
  assert.equal((await makeHandler({ getConfig: () => null }).handler(upload(goodCsv()))).status, 503);
  const { handler } = makeHandler();
  assert.equal((await handler(new Request("http://x", { method: "POST", body: "a,b", headers: { authorization: "Bearer good", "content-type": "text/csv" } }))).status, 415);
  assert.equal((await handler(upload(null))).status, 400);
  assert.equal((await handler(upload(goodCsv(), { field: "other" }))).status, 400);
  assert.equal((await handler(upload(new Uint8Array(cfgMod.LIMITS.maxBytes + 1)))).status, 413);
  const declared = new Request("http://x", { method: "POST", body: new FormData(), headers: { authorization: "Bearer good", "content-length": String(cfgMod.LIMITS.maxBytes + 200_000) } });
  assert.equal((await handler(declared)).status, 413); // נדחה לפי כותרת, לפני קריאת הגוף
  const zip = await handler(upload(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0])));
  assert.equal(zip.status, 415); assert.equal((await zip.json()).code, "unsupported_format_xlsx");
  const wrong = await handler(upload(enc("A,B,C\r\n1,2,3")));
  assert.equal(wrong.status, 422); assert.deepEqual(await wrong.json(), { code: "unrecognized_headers", missing: ["date", "description", "amount"] });
});

test("handler: happy path returns a draft only, saves nothing, audits without content", async () => {
  const { handler, audits } = makeHandler();
  const res = await handler(upload(goodCsv()));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const { preview } = await res.json();
  assert.equal(preview.status, "draft"); assert.equal(preview.saved, false);
  assert.equal(preview.dedupe.againstExisting, false); // אין DB ב-PR 1, והתשובה אומרת זאת
  assert.deepEqual([preview.summary.new, preview.summary.duplicate, preview.summary.invalid, preview.summary.identicalRowsKeptSeparate], [3, 0, 1, 1]);
  assert.equal(preview.summary.expenseTotal, 201); assert.equal(preview.summary.incomeTotal, 15000);
  assert.deepEqual(preview.errors, [{ rowNumber: 5, field: "date", code: "invalid_date" }]);
  assert.equal(preview.sample.find(r => r.description === "שופרסל").category, "מזון");
  assert.equal(preview.sample.find(r => r.description === "שופרסל").account, "••••7890");
  assert.deepEqual(preview.ignoredColumns, ["Balance"]);
  assert.equal(audits.length, 1);
  assert.equal(JSON.stringify(audits[0]).includes("שופרסל"), false);
  assert.equal(audits[0].userId, UID);
});

test("handler: unexpected failures return a bare code, never a message or stack", async () => {
  const boom = makeHandler({ limiter: { check() { throw new Error("SECRET-INTERNAL-DETAIL"); } } }).handler;
  const res = await boom(upload(goodCsv()));
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { code: "internal_error" });
});

test("the real route denies unauthenticated requests", async () => {
  const route = await import("../app/api/kesef/import/preview/route.js");
  const res = await route.POST(new Request("http://localhost/api/kesef/import/preview", { method: "POST" }));
  assert.equal(res.status, 401);
});

test("source hygiene: no network calls, no service role, no secrets in the import code", async () => {
  const files = [...(await readdir(new URL("../lib/riseup-import/", import.meta.url))).map(f => `../lib/riseup-import/${f}`), "../lib/server-auth.js", "../app/api/kesef/import/preview/route.js"];
  for (const f of files) {
    const src = await readFile(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /service[_\s-]?role/i, `${f} must not use a service role`);
    assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|https?:\/\/(?!x\.supabase)/, `${f} must not make network calls`);
    assert.doesNotMatch(src, /AIza[0-9A-Za-z_-]{20,}|\bsk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}/, `${f} looks like it contains a secret`);
  }
});
