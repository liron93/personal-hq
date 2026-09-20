import assert from "node:assert/strict";
import test from "node:test";

const docs = await import("../lib/home-documents.js");

const file = (name, type, size = 1000) => ({ name, type, size });
const ok = input => docs.validateUpload({ title: "תוכנית נגרות מטבח", description: "", category: "תוכנית נגרות", ...input });
const fields = r => (r.ok ? [] : r.errors.map(e => e.field));

test("validation: title, description, category (preset or free text) and file are all checked", () => {
  const good = ok({ file: file("plan.pdf", "application/pdf") });
  assert.equal(good.ok, true);
  assert.deepEqual([good.value.title, good.value.category, good.value.mime, good.value.fileName], ["תוכנית נגרות מטבח", "תוכנית נגרות", "application/pdf", "plan.pdf"]);
  assert.deepEqual(fields(ok({ title: "  ", file: file("a.pdf", "application/pdf") })), ["title"]);
  assert.deepEqual(fields(ok({ title: "x".repeat(121), file: file("a.pdf", "application/pdf") })), ["title"]);
  assert.deepEqual(fields(ok({ description: "x".repeat(1001), file: file("a.pdf", "application/pdf") })), ["description"]);
  assert.deepEqual(fields(ok({ category: "לא ברשימה", file: file("a.pdf", "application/pdf") })), ["category"]);
  assert.deepEqual(fields(ok({ file: null })), ["file"]);
});

test("free-text category: required when chosen, trimmed, length-limited", () => {
  const f = file("a.pdf", "application/pdf");
  assert.deepEqual(fields(ok({ category: docs.CUSTOM_CATEGORY, customCategory: "   ", file: f })), ["category"]);
  assert.deepEqual(fields(ok({ category: docs.CUSTOM_CATEGORY, customCategory: "x".repeat(41), file: f })), ["category"]);
  const custom = ok({ category: docs.CUSTOM_CATEGORY, customCategory: "  קבלות   חשמלאי  ", file: f });
  assert.equal(custom.ok, true);
  assert.equal(custom.value.category, "קבלות חשמלאי");
  assert.equal(ok({ category: "חשבונית", customCategory: "ignored", file: f }).value.category, "חשבונית"); // שדה חופשי לא משפיע כשבחרו קטגוריה מוכנה
});

test("file rules: size, empty, allowed types, and MIME must match the extension", () => {
  assert.deepEqual(fields(ok({ file: file("a.pdf", "application/pdf", docs.MAX_BYTES + 1) })), ["file"]);
  assert.equal(ok({ file: file("a.pdf", "application/pdf", docs.MAX_BYTES) }).ok, true);
  assert.deepEqual(fields(ok({ file: file("a.pdf", "application/pdf", 0) })), ["file"]);
  for (const [n, t] of [["a.html", "text/html"], ["a.svg", "image/svg+xml"], ["a.exe", "application/x-msdownload"], ["a.zip", "application/zip"], ["a.js", "text/javascript"]]) assert.deepEqual(fields(ok({ file: file(n, t) })), ["file"], n);
  assert.deepEqual(fields(ok({ file: file("evil.html", "application/pdf") })), ["file"]); // MIME של PDF עם סיומת HTML נדחה
  assert.deepEqual(fields(ok({ file: file("photo.pdf", "image/png") })), ["file"]);
  for (const [n, t] of [["a.jpg", "image/jpeg"], ["a.JPEG", "image/jpeg"], ["a.png", "image/png"], ["a.webp", "image/webp"], ["a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ["a.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]]) assert.equal(ok({ file: file(n, t) }).ok, true, n);
  assert.equal(ok({ file: file("IMG_0001.HEIC", "") }).value.mime, "image/heic"); // iPhone: בלי MIME, לפי הסיומת
  assert.equal(ok({ file: file("IMG_0001.heic", "image/heic") }).ok, true);
  assert.equal(ok({ file: file("scan", "application/pdf") }).ok, true); // שם בלי סיומת אבל MIME מותר
});

import { existsSync } from "node:fs";
const sqlPath = new URL("../supabase/proposed/rbac/002_home_documents_storage.sql", import.meta.url);
test("allowed types are exactly the ones the bucket allows (SQL patch)", { skip: !existsSync(sqlPath) && "runs once supabase/proposed/rbac lands (PR #70)" }, async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(sqlPath, "utf8");
  const list = /array\[([^\]]*)\]/.exec(sql)[1];
  const listed = [...list.matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual([...listed].sort(), Object.keys(docs.ALLOWED_TYPES).sort());
  assert.match(sql, new RegExp(`file_size_limit[^;]*${docs.MAX_BYTES}`));
});

test("safe file names and object paths: one folder, no traversal, no control characters", () => {
  assert.equal(docs.safeFileName("תוכנית נגרות (סופי).pdf"), "תוכנית_נגרות_סופי.pdf");
  assert.equal(docs.safeFileName("../../etc/passwd"), "passwd");
  assert.equal(docs.safeFileName("C:\\Users\\x\\invoice 1.PDF"), "invoice_1.pdf");
  assert.equal(docs.safeFileName("a\u0000b\u202e.pdf"), "ab.pdf");
  assert.equal(docs.safeFileName("   "), "file");
  assert.equal(docs.safeFileName(".pdf"), "file.pdf");
  assert.ok(docs.safeFileName(`${"a".repeat(200)}.pdf`).length <= 64);
  const p = docs.objectPath("ws-1", "id-1", "../x y/z.PDF");
  assert.equal(p, "ws-1/id-1-z.pdf");
  assert.equal(p.split("/").length, 2);
});

function fakeClient({ workspaces, workspacesError, upload, sign, remove } = {}) {
  return {
    from: table => { assert.equal(table, "workspaces"); return { select: () => ({ eq: () => ({ limit: async () => ({ data: workspaces, error: workspacesError ?? null }) }) }) }; },
    storage: { from: bucket => { assert.equal(bucket, docs.BUCKET); return { upload: async (...a) => upload(...a), createSignedUrl: async (...a) => sign(...a), remove: async (...a) => remove(...a) }; } },
  };
}

test("workspace resolution: found, none (RLS or not enabled), missing table, network failure", async () => {
  assert.deepEqual(await docs.createHomeDocuments(fakeClient({ workspaces: [{ id: "W" }] })).resolveWorkspaceId(), { ok: true, workspaceId: "W", ownerId: null });
  assert.deepEqual(await docs.createHomeDocuments(fakeClient({ workspaces: [{ id: "W", owner_id: "O" }] })).resolveWorkspaceId(), { ok: true, workspaceId: "W", ownerId: "O" });
  assert.deepEqual(await docs.createHomeDocuments(fakeClient({ workspaces: [] })).resolveWorkspaceId(), { ok: false, code: "not_enabled" });
  assert.deepEqual(await docs.createHomeDocuments(fakeClient({ workspaces: null, workspacesError: { code: "PGRST205", message: "Could not find the table" } })).resolveWorkspaceId(), { ok: false, code: "not_enabled" });
  assert.deepEqual(await docs.createHomeDocuments(fakeClient({ workspaces: null, workspacesError: { message: "fetch failed" } })).resolveWorkspaceId(), { ok: false, code: "network" });
  const throwing = { from: () => { throw new Error("boom"); } };
  assert.deepEqual(await docs.createHomeDocuments(throwing).resolveWorkspaceId(), { ok: false, code: "network" });
});

test("upload maps storage errors to stable codes and never throws", async () => {
  const run = error => docs.createHomeDocuments(fakeClient({ upload: async () => ({ error }) })).upload("W/id-a.pdf", {}, "application/pdf");
  assert.deepEqual(await run(null), { ok: true });
  assert.equal((await run({ message: "Bucket not found", statusCode: "404" })).code, "not_enabled");
  assert.equal((await run({ message: "new row violates row-level security policy", statusCode: "403" })).code, "forbidden");
  assert.equal((await run({ message: "The object exceeded the maximum allowed size", statusCode: "413" })).code, "too_large");
  assert.equal((await run({ message: "mime type text/html is not supported" })).code, "bad_type");
  assert.equal((await run({ message: "The resource already exists", statusCode: "409" })).code, "conflict");
  assert.equal((await run({ message: "fetch failed" })).code, "network");
  const throwing = docs.createHomeDocuments(fakeClient({ upload: async () => { throw new Error("x"); } }));
  assert.deepEqual(await throwing.upload("p", {}, "t"), { ok: false, code: "network" });
});

test("upload sends the path, real content type, and refuses to overwrite", async () => {
  let seen;
  const c = docs.createHomeDocuments(fakeClient({ upload: async (path, body, opts) => { seen = { path, opts }; return { error: null }; } }));
  await c.upload("W/id-a.pdf", { fake: 1 }, "application/pdf");
  assert.equal(seen.path, "W/id-a.pdf");
  assert.equal(seen.opts.upsert, false);
  assert.equal(seen.opts.contentType, "application/pdf");
});

test("remove: an empty result means the policy blocked it (forbidden), not success", async () => {
  const run = result => docs.createHomeDocuments(fakeClient({ remove: async () => result })).remove("W/id-a.pdf");
  assert.deepEqual(await run({ data: [{ name: "x" }], error: null }), { ok: true });
  assert.deepEqual(await run({ data: [], error: null }), { ok: false, code: "forbidden" });
  assert.equal((await run({ data: null, error: { message: "fetch failed" } })).code, "network");
});

test("signed URL is short-lived and errors are contained", async () => {
  let ttl;
  const c = docs.createHomeDocuments(fakeClient({ sign: async (p, s) => { ttl = s; return { data: { signedUrl: "https://example.test/x?token=t" }, error: null }; } }));
  assert.deepEqual(await c.signedUrl("W/id-a.pdf"), { ok: true, url: "https://example.test/x?token=t" });
  assert.ok(ttl <= 120);
  assert.equal((await docs.createHomeDocuments(fakeClient({ sign: async () => ({ data: null, error: { message: "Object not found", statusCode: "404" } }) })).signedUrl("p")).ok, false);
  assert.equal(docs.messageFor("not_enabled").includes("לא הופעל"), true);
  assert.equal(docs.formatSize(1536), "2 KB");
  assert.equal(docs.formatSize(5 * 1024 * 1024), "5.0 MB");
});

test("a hanging network resolves to a network error instead of waiting forever", async () => {
  const hanging = { from: () => ({ select: () => ({ eq: () => ({ limit: () => new Promise(() => {}) }) }) }) };
  const started = Date.now();
  assert.deepEqual(await docs.createHomeDocuments(hanging, { timeoutMs: 30 }).resolveWorkspaceId(), { ok: false, code: "network" });
  assert.ok(Date.now() - started < 1000);
});
