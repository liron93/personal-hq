import assert from "node:assert/strict";
import test from "node:test";

const img = await import("../companies/beit-hadash/images.js");
const docs = await import("../lib/home-documents.js");

const file = (name, type, size = 1000) => ({ name, type, size });
const entry = (id, path = `ws/${id}-a.jpg`) => ({ id, path, name: "a.jpg", mime: "image/jpeg", size: 10, createdAt: "2026-01-01T00:00:00.000Z" });

// לקוח מזויף: workspaces ו-Storage. opts שולטים בהתנהגות.
function fakeClient({ workspaces = [{ id: "ws1", owner_id: "u1" }], wsError = null, uploadError = null, removeData = [{}] } = {}) {
  const calls = { upload: [], remove: [], signed: [] };
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: workspaces, error: wsError }) }) }) }),
    storage: { from: bucket => { calls.bucket = bucket; return {
      upload: async (path, f, opts) => { calls.upload.push({ path, opts }); return { error: uploadError }; },
      remove: async paths => { calls.remove.push(paths); return { data: removeData, error: null }; },
      createSignedUrl: async (path, s) => { calls.signed.push([path, s]); return { data: { signedUrl: `https://x/${path}?t=${calls.signed.length}` }, error: null }; },
    }; } },
  };
  return { client, calls };
}

test("scaleDimensions: max side 1600, keeps ratio, never upscales, handles junk", () => {
  assert.deepEqual(img.scaleDimensions(4000, 3000), { width: 1600, height: 1200, scaled: true });
  assert.deepEqual(img.scaleDimensions(3000, 4000), { width: 1200, height: 1600, scaled: true });
  assert.deepEqual(img.scaleDimensions(1600, 900), { width: 1600, height: 900, scaled: false });
  assert.deepEqual(img.scaleDimensions(800, 600), { width: 800, height: 600, scaled: false });
  assert.deepEqual(img.scaleDimensions(10000, 1), { width: 1600, height: 1, scaled: true });
  assert.deepEqual(img.scaleDimensions(0, 500), { width: 0, height: 0, scaled: false });
  assert.deepEqual(img.scaleDimensions("x", 5), { width: 0, height: 0, scaled: false });
});

test("shouldDownscale / downscaledName", () => {
  for (const m of ["image/jpeg", "image/png", "image/webp"]) assert.equal(img.shouldDownscale(m), true);
  assert.equal(img.shouldDownscale("image/heic"), false);
  assert.equal(img.downscaledName("IMG_1.PNG"), "IMG_1.jpg");
  assert.equal(img.downscaledName(""), "photo.jpg");
});

test("validateImageFile: image types only, extension must match, size cap, empty", () => {
  const ok = docs.validateImageFile(file("a.jpg", "image/jpeg"));
  assert.equal(ok.ok, true);
  assert.equal(ok.value.mime, "image/jpeg");
  assert.equal(docs.validateImageFile(file("IMG_1.HEIC", "")).value.mime, "image/heic");
  for (const [n, t] of [["a.pdf", "application/pdf"], ["a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ["a.svg", "image/svg+xml"], ["a.gif", "image/gif"], ["evil.html", "image/png"], ["a.png", "text/html"]]) assert.equal(docs.validateImageFile(file(n, t)).ok, false, n);
  assert.equal(docs.validateImageFile(file("a.jpg", "image/jpeg", 0)).ok, false);
  assert.equal(docs.validateImageFile(file("a.jpg", "image/jpeg", docs.IMAGE_MAX_BYTES)).ok, true);
  assert.equal(docs.validateImageFile(file("a.jpg", "image/jpeg", docs.IMAGE_MAX_BYTES + 1)).ok, false);
  assert.equal(docs.validateImageFile(null).ok, false);
  assert.equal(docs.IMAGE_MAX_BYTES, 10 * 1024 * 1024);
});

test("image list: add, remove, max 6, backward compatible with missing/garbage images", () => {
  assert.deepEqual(img.imagesOf({}), []);
  assert.deepEqual(img.imagesOf(null), []);
  assert.deepEqual(img.imagesOf({ images: "x" }), []);
  assert.deepEqual(img.imagesOf({ images: [null, { id: 1 }, { id: "a" }, entry("ok")] }).map(x => x.id), ["ok"]);
  let list = [];
  for (let i = 0; i < 8; i++) list = img.addImage(list, entry(`i${i}`));
  assert.equal(list.length, img.MAX_IMAGES);
  assert.equal(img.MAX_IMAGES, 6);
  assert.equal(img.remainingSlots(list), 0);
  const after = img.removeImage(list, "i2");
  assert.equal(after.length, 5);
  assert.equal(img.remainingSlots(after), 1);
  assert.equal(list.length, 6); // בלי mutation
  assert.deepEqual(img.pathsOf(after), after.map(x => x.path));
  assert.equal(img.remainingSlots(undefined), 6);
});

test("an existing entry without images is untouched by helpers (no data loss)", () => {
  const old = { id: "x", name: "מקרר", estimate: 5000, lines: [], payments: [] };
  assert.deepEqual(img.imagesOf(old), []);
  const next = { ...old, images: img.addImage(img.imagesOf(old), entry("n")) };
  assert.deepEqual({ ...next, images: undefined }, { ...old, images: undefined });
  assert.equal(next.images.length, 1);
});

test("buildImageEntry has the documented shape", () => {
  const e = img.buildImageEntry({ id: "i", path: "ws/i-a.jpg", name: "a.jpg", mime: "image/jpeg", size: 5, now: () => "T" });
  assert.deepEqual(e, { id: "i", path: "ws/i-a.jpg", name: "a.jpg", mime: "image/jpeg", size: 5, createdAt: "T" });
});

test("pathsToRemove: cancel drops only this session's uploads; save also drops removed saved images", () => {
  const initial = ["ws/old1", "ws/old2"], uploaded = ["ws/new1", "ws/new2"];
  assert.deepEqual(img.pathsToRemove({ initial, final: ["ws/old1", "ws/new1"], uploaded, saved: false }).sort(), ["ws/new1", "ws/new2"]);
  assert.deepEqual(img.pathsToRemove({ initial, final: ["ws/old1", "ws/old2"], uploaded: [], saved: false }), []); // ביטול לא נוגע בשמור
  assert.deepEqual(img.pathsToRemove({ initial, final: ["ws/old1", "ws/new1"], uploaded, saved: true }).sort(), ["ws/new2", "ws/old2"]);
  assert.deepEqual(img.pathsToRemove({ initial, final: initial, uploaded: [], saved: true }), []);
});

test("attachImage (enabled): validates, downscales, builds <workspace>/<id>-<name> path, uploads with contentType", async () => {
  const { client, calls } = fakeClient();
  const api = docs.createHomeDocuments(client);
  let downscaled = null;
  const big = file("IMG 0001.PNG", "image/png", 30 * 1024 * 1024); // גדול מ-10MB לפני כיווץ, מותר כי מכווצים
  const r = await img.attachImage({ api, file: big, current: [], id: "abc", now: () => "T", downscale: async (f, mime) => { downscaled = mime; return file("IMG 0001.jpg", "image/jpeg", 400000); } });
  assert.equal(r.ok, true);
  assert.equal(downscaled, "image/png");
  assert.equal(calls.bucket, "home-documents");
  assert.equal(calls.upload.length, 1);
  assert.equal(calls.upload[0].path, "ws1/abc-IMG_0001.jpg");
  assert.equal(calls.upload[0].opts.contentType, "image/jpeg");
  assert.deepEqual(r.entry, { id: "abc", path: "ws1/abc-IMG_0001.jpg", name: "IMG_0001.jpg", mime: "image/jpeg", size: 400000, createdAt: "T" });
});

test("attachImage: rejects bad type, too big after downscale, and a 7th image, without uploading", async () => {
  const { client, calls } = fakeClient();
  const api = docs.createHomeDocuments(client);
  const bad = await img.attachImage({ api, file: file("a.pdf", "application/pdf"), current: [] });
  assert.equal(bad.ok, false);
  const huge = await img.attachImage({ api, file: file("a.heic", "image/heic", 11 * 1024 * 1024), current: [] }); // HEIC לא מכווץ
  assert.equal(huge.ok, false);
  const full = await img.attachImage({ api, file: file("a.jpg", "image/jpeg"), current: Array.from({ length: 6 }, (_, i) => entry(`i${i}`)) });
  assert.deepEqual([full.ok, full.code, full.message], [false, "max", img.MAX_TEXT]);
  assert.equal(calls.upload.length, 0);
});

test("attachImage: a throwing downscale falls back to the original file", async () => {
  const { client, calls } = fakeClient();
  const r = await img.attachImage({ api: docs.createHomeDocuments(client), file: file("a.jpg", "image/jpeg", 5000), current: [], id: "z", downscale: async () => { throw new Error("decode"); } });
  assert.equal(r.ok, true);
  assert.equal(calls.upload[0].path, "ws1/z-a.jpg");
});

test("degrade: no shared workspace => not_enabled message, nothing uploaded, no data URL fallback", async () => {
  const { client, calls } = fakeClient({ workspaces: [] });
  const r = await img.attachImage({ api: docs.createHomeDocuments(client), file: file("a.jpg", "image/jpeg"), current: [], downscale: async () => { throw new Error("must not run"); } });
  assert.equal(r.ok, false);
  assert.equal(r.code, "not_enabled");
  assert.equal(r.message, "העלאת תמונות תופעל עם הפעלת אחסון הקבצים (עדיין בבדיקה)");
  assert.equal(calls.upload.length, 0);
  assert.equal(JSON.stringify(r).includes("data:"), false);
});

test("degrade: workspaces table missing / bucket not found => not_enabled", async () => {
  const a = fakeClient({ wsError: { code: "PGRST205", message: "no table" } });
  assert.equal((await img.attachImage({ api: docs.createHomeDocuments(a.client), file: file("a.jpg", "image/jpeg"), current: [] })).code, "not_enabled");
  const b = fakeClient({ uploadError: { message: "Bucket not found", statusCode: 404 } });
  const r = await img.attachImage({ api: docs.createHomeDocuments(b.client), file: file("a.jpg", "image/jpeg"), current: [] });
  assert.deepEqual([r.ok, r.code, r.message], [false, "not_enabled", img.NOT_ENABLED_TEXT]);
});

test("upload errors map to Hebrew messages (forbidden, network)", async () => {
  const f = fakeClient({ uploadError: { message: "new row violates row-level security policy", statusCode: 403 } });
  const r = await img.attachImage({ api: docs.createHomeDocuments(f.client), file: file("a.jpg", "image/jpeg"), current: [] });
  assert.deepEqual([r.code, r.message], ["forbidden", "אין הרשאה להעלות תמונות"]);
  const n = fakeClient({ uploadError: { message: "boom" } });
  assert.equal((await img.attachImage({ api: docs.createHomeDocuments(n.client), file: file("a.jpg", "image/jpeg"), current: [] })).code, "network");
});

test("workspace lookup is cached per api (one call), but a network failure is retried", async () => {
  let n = 0;
  const api = { resolveWorkspaceId: async () => { n++; return { ok: false, code: "not_enabled" }; } };
  await img.resolveWorkspaceCached(api); await img.resolveWorkspaceCached(api);
  assert.equal(n, 1);
  let m = 0;
  const flaky = { resolveWorkspaceId: async () => { m++; return m === 1 ? { ok: false, code: "network" } : { ok: true, workspaceId: "w" }; } };
  assert.equal((await img.resolveWorkspaceCached(flaky)).code, "network");
  assert.equal((await img.resolveWorkspaceCached(flaky)).ok, true);
});

test("removeObjects: best effort, dedupes, never throws even when remove rejects", async () => {
  const { client, calls } = fakeClient();
  await img.removeObjects(docs.createHomeDocuments(client), ["ws/a", "ws/a", "ws/b"]);
  assert.deepEqual(calls.remove.map(x => x[0]).sort(), ["ws/a", "ws/b"]);
  await img.removeObjects({ remove: async () => { throw new Error("x"); } }, ["ws/a"]);
  await img.removeObjects(docs.createHomeDocuments(fakeClient({ removeData: [] }).client), ["ws/a"]); // forbidden: מתעלמים
});

test("signed URL cache: reuses fresh URL, dedupes in-flight, refreshes after ttl or invalidate", async () => {
  const { client, calls } = fakeClient();
  let t = 0;
  const cache = img.createUrlCache(docs.createHomeDocuments(client), { now: () => t, ttlMs: 60000 });
  const [a, b] = await Promise.all([cache.get("ws/a"), cache.get("ws/a")]);
  assert.equal(calls.signed.length, 1);
  assert.equal(a.url, b.url);
  t = 30000; await cache.get("ws/a"); assert.equal(calls.signed.length, 1);
  t = 61000; await cache.get("ws/a"); assert.equal(calls.signed.length, 2);
  cache.invalidate("ws/a"); await cache.get("ws/a"); assert.equal(calls.signed.length, 3);
  assert.equal(calls.signed[0][1], 90);
});
