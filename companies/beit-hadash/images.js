// לוגיקה טהורה של תמונות בהשראות וברכש (בית חדש): גודל, רשימה, נתיב, העלאה מול המעטפת המוזרקת, מטמון כתובות חתומות.
// אין כאן DOM/קנבס/React, כדי שאפשר לבדוק ב-node:test. הקנבס והרכיב נמצאים ב-ImageAttachments.jsx.
// מבנה נתונים: entry.images = [{ id, path, name, mime, size, createdAt }] (אופציונלי, עד MAX_IMAGES). חסר = [].
import { IMAGE_MAX_BYTES, messageFor, objectPath, validateImageFile } from "../../lib/home-documents.js";

export const MAX_IMAGES = 6;
export const MAX_SIDE = 1600;
export const JPEG_QUALITY = 0.82;
export const RAW_MAX_BYTES = 50 * 1024 * 1024; // תקרה סבירה לתמונה גולמית לפני כיווץ (צילומי טלפון)
export const NOT_ENABLED_TEXT = "העלאת תמונות תופעל עם הפעלת אחסון הקבצים (עדיין בבדיקה)";
export const MAX_TEXT = `אפשר עד ${MAX_IMAGES} תמונות`;

/** ממדים אחרי כיווץ: הצלע הארוכה לא עוברת max, יחס נשמר, אף פעם לא מגדילים. */
export function scaleDimensions(width, height, max = MAX_SIDE) {
  const w = Math.round(Number(width)), h = Math.round(Number(height));
  if (!(w > 0) || !(h > 0)) return { width: 0, height: 0, scaled: false };
  const longest = Math.max(w, h);
  if (longest <= max) return { width: w, height: h, scaled: false };
  const ratio = max / longest;
  return { width: Math.max(1, Math.round(w * ratio)), height: Math.max(1, Math.round(h * ratio)), scaled: true };
}

/** רק jpeg/png/webp עוברים כיווץ בקנבס. HEIC נשלח כמו שהוא (רוב הדפדפנים לא מפענחים אותו). */
export const shouldDownscale = mime => mime === "image/jpeg" || mime === "image/png" || mime === "image/webp";
export const downscaledName = name => `${String(name || "photo").replace(/\.[A-Za-z0-9]{1,5}$/, "") || "photo"}.jpg`;

export const imagesOf = entry => (Array.isArray(entry?.images) ? entry.images : []).filter(x => x && typeof x.id === "string" && typeof x.path === "string" && x.path);
export const pathsOf = images => imagesOf({ images }).map(x => x.path);
export const remainingSlots = images => Math.max(0, MAX_IMAGES - imagesOf({ images }).length);
export const addImage = (images, image) => (remainingSlots(images) > 0 ? [...imagesOf({ images }), image] : imagesOf({ images }));
export const removeImage = (images, id) => imagesOf({ images }).filter(x => x.id !== id);
export const buildImageEntry = ({ id, path, name, mime, size, now = () => new Date().toISOString() }) => ({ id, path, name, mime, size, createdAt: now() });

/** אילו נתיבים למחוק מה-Storage. saved=true: נמחקו מהרשימה השמורה, או הועלו ולא נשמרו. saved=false (ביטול): רק מה שהועלה בסשן העריכה. */
export function pathsToRemove({ initial = [], final = [], uploaded = [], saved }) {
  if (!saved) return [...uploaded]; // ביטול: כל מה שהועלה בסשן נזרק, השמור לא נוגע
  const keep = new Set(final);
  const out = uploaded.filter(p => !keep.has(p));
  for (const p of initial) if (!keep.has(p) && !out.includes(p)) out.push(p);
  return out;
}

// המרחב המשותף נבדק פעם אחת לכל api (הצלחה או not_enabled). כשל רשת לא נשמר, כדי שאפשר לנסות שוב.
const wsCache = new WeakMap();
export function resolveWorkspaceCached(api) {
  if (!wsCache.has(api)) {
    const p = api.resolveWorkspaceId().then(r => { if (!r.ok && r.code === "network") wsCache.delete(api); return r; });
    wsCache.set(api, p);
  }
  return wsCache.get(api);
}

const uploadMessage = code => (code === "not_enabled" ? NOT_ENABLED_TEXT : code === "forbidden" ? "אין הרשאה להעלות תמונות" : messageFor(code));

/**
 * מעלה תמונה אחת. לא זורק. סדר: מכסה, סוג, האם האחסון פעיל (לפני כיווץ, כדי לא לבזבז זמן), כיווץ, גודל סופי, העלאה.
 * downscale(file, mime) => Promise<File> מוזרק (קנבס בדפדפן).
 * @returns {Promise<{ok:true,entry:object}|{ok:false,code:string,message:string}>}
 */
export async function attachImage({ api, file, current = [], downscale = async f => f, id = globalThis.crypto?.randomUUID?.() || String(Math.random()).slice(2), now }) {
  if (remainingSlots(current) <= 0) return { ok: false, code: "max", message: MAX_TEXT };
  const pre = validateImageFile(file, { maxBytes: RAW_MAX_BYTES });
  if (!pre.ok) return { ok: false, code: "invalid", message: pre.message };
  const ws = await resolveWorkspaceCached(api);
  if (!ws.ok) return { ok: false, code: ws.code, message: uploadMessage(ws.code) };
  let out;
  try { out = await downscale(file, pre.value.mime); } catch { out = file; }
  const fin = validateImageFile(out || file, { maxBytes: IMAGE_MAX_BYTES });
  if (!fin.ok) return { ok: false, code: "invalid", message: fin.message };
  const path = objectPath(ws.workspaceId, id, fin.value.fileName);
  const up = await api.upload(path, out || file, fin.value.mime);
  if (!up.ok) return { ok: false, code: up.code, message: uploadMessage(up.code) };
  return { ok: true, entry: buildImageEntry({ id, path, name: fin.value.fileName, mime: fin.value.mime, size: fin.value.size, now }) };
}

/** מחיקה best-effort של אובייקטים. לא זורק, לא מדווח כשל (יתומים אפשריים אם אין הרשאת מחיקה). */
export async function removeObjects(api, paths) {
  await Promise.all([...new Set(paths || [])].map(p => api.remove(p).catch(() => null)));
}

/** מטמון כתובות חתומות (הן פגות אחרי ~90 שנ'): מחזיר אחת קיימת אם טרייה, מאחד בקשות מקבילות, ומרענן לפי דרישה. */
export function createUrlCache(api, { now = Date.now, ttlMs = 60000, seconds = 90 } = {}) {
  const map = new Map(), pending = new Map();
  return {
    get(path) {
      const hit = map.get(path);
      if (hit && now() - hit.at < ttlMs) return Promise.resolve({ ok: true, url: hit.url });
      if (pending.has(path)) return pending.get(path);
      const p = api.signedUrl(path, seconds).then(r => { pending.delete(path); if (r.ok) map.set(path, { url: r.url, at: now() }); return r; });
      pending.set(path, p);
      return p;
    },
    invalidate(path) { map.delete(path); },
  };
}
