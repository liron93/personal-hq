// קבצים משותפים של בית חדש (חשבוניות, תוכנית נגרות וכו'): ולידציה, ניקוי שם קובץ, והמעטפת היחידה מול Supabase Storage.
// לא פעיל עד שה-bucket `home-documents` וה-policies שלו נפרסים (supabase/proposed/rbac/002_home_documents_storage.sql,
// אחרי review). עד אז כל קריאה מחזירה code:"not_enabled" והממשק אומר את זה במפורש.
// ההרשאות נאכפות בשרת (RLS ב-Storage). הבדיקות כאן הן לנוחות המשתמש ולניקיון נתונים, לא לאבטחה.
// המעטפת מקבלת client מוזרק, כדי שאפשר לבדוק אותה בלי רשת.

export const BUCKET = "home-documents";
export const MAX_BYTES = 25 * 1024 * 1024; // חייב להיות זהה ל-file_size_limit ב-002
export const CUSTOM_CATEGORY = "__custom__";
export const DOC_CATEGORIES = Object.freeze(["חשבונית", "תוכנית נגרות", "תוכנית / שרטוט", "הצעת מחיר", "חוזה", "אישור תשלום", "בדק בית", "אחר"]);

// זהה ל-allowed_mime_types ב-002. סיומת נבדקת גם היא, כי דפדפנים לפעמים לא מדווחים MIME (למשל HEIC).
export const ALLOWED_TYPES = Object.freeze({
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic", ".heif"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
});
export const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.docx,.xlsx,image/*,application/pdf";

const EXT_TO_MIME = Object.freeze(Object.fromEntries(Object.entries(ALLOWED_TYPES).flatMap(([mime, exts]) => exts.map(e => [e, mime]))));
const CONTROL = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e]/g;

const extOf = name => { const m = /\.[A-Za-z0-9]{1,5}$/.exec(String(name || "")); return m ? m[0].toLowerCase() : ""; };

/** שם קובץ בטוח לנתיב Storage: בלי נתיב, בלי תווי בקרה, אותיות/ספרות/עברית/נקודה/מקף/קו תחתון, ועם סיומת נשמרת. */
export function safeFileName(name) {
  const base = String(name || "").split(/[\\/]/).pop().replace(CONTROL, "");
  const ext = extOf(base);
  const stem = base.slice(0, base.length - ext.length).replace(/[^\w֐-׿.\- ]/g, "_").replace(/[ _]+/g, "_").replace(/^[._-]+|[._-]+$/g, "").slice(0, 60);
  return `${stem || "file"}${ext}`;
}

/** נתיב האובייקט: <workspace_id>/<id>-<שם>. תיקייה אחת בלבד, כמו שה-policy דורשת. */
export function objectPath(workspaceId, id, fileName) {
  return `${workspaceId}/${id}-${safeFileName(fileName)}`;
}

export function resolveMime(file) {
  const ext = extOf(file?.name);
  // MIME מותר: הסיומת חייבת להתאים לו (או להיות חסרה). בלי זה, PDF בשם evil.html היה עובר.
  if (file?.type && ALLOWED_TYPES[file.type]) return !ext || ALLOWED_TYPES[file.type].includes(ext) ? file.type : null;
  return file?.type ? null : EXT_TO_MIME[ext] || null; // בלי MIME מהדפדפן (למשל HEIC): מסתמכים על הסיומת
}

/** @returns {{ok:true,value:object}|{ok:false,errors:{field:string,message:string}[]}} */
export function validateUpload({ title, description, category, customCategory, file }) {
  const errors = []; const err = (field, message) => errors.push({ field, message });
  const t = String(title || "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  if (!t) err("title", "צריך כותרת"); else if (t.length > 120) err("title", "כותרת עד 120 תווים");
  const d = String(description || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (d.length > 1000) err("description", "תיאור עד 1000 תווים");
  let cat = String(category || "");
  if (cat === CUSTOM_CATEGORY) {
    cat = String(customCategory || "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
    if (!cat) err("category", "צריך לכתוב שם קטגוריה"); else if (cat.length > 40) err("category", "שם קטגוריה עד 40 תווים");
  } else if (!DOC_CATEGORIES.includes(cat)) err("category", "בחרו קטגוריה");
  let mime = null;
  if (!file || typeof file.size !== "number") err("file", "צריך לבחור קובץ");
  else if (file.size === 0) err("file", "הקובץ ריק");
  else if (file.size > MAX_BYTES) err("file", "הקובץ גדול מ-25MB");
  else { mime = resolveMime(file); if (!mime) err("file", "סוג קובץ לא נתמך. אפשר PDF, תמונה, Word או Excel"); }
  return errors.length ? { ok: false, errors } : { ok: true, value: { title: t, description: d, category: cat, mime, fileName: safeFileName(file.name), size: file.size } };
}

export function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MESSAGES = Object.freeze({
  not_enabled: "אחסון הקבצים עדיין לא הופעל בחשבון הזה",
  forbidden: "אין הרשאה לפעולה הזו",
  too_large: "הקובץ גדול מדי",
  bad_type: "סוג הקובץ לא נתמך",
  conflict: "קובץ בשם הזה כבר קיים. נסו שוב",
  network: "הפעולה נכשלה. בדקו חיבור ונסו שוב",
});
export const messageFor = code => MESSAGES[code] || MESSAGES.network;

function classify(error) {
  const text = `${error?.message || ""} ${error?.error || ""}`.toLowerCase();
  const status = Number(error?.statusCode ?? error?.status ?? 0);
  if (text.includes("bucket not found") || error?.code === "PGRST205" || error?.code === "42P01") return "not_enabled";
  if (status === 413 || text.includes("exceeded the maximum") || text.includes("maximum allowed size")) return "too_large";
  if (text.includes("mime type") || text.includes("not supported")) return "bad_type";
  if (status === 409 || text.includes("already exists") || text.includes("duplicate")) return "conflict";
  if (status === 401 || status === 403 || text.includes("row-level security") || text.includes("unauthorized") || text.includes("not allowed") || error?.code === "42501") return "forbidden";
  return "network";
}

/** המעטפת היחידה מול Supabase. אף פונקציה לא זורקת: תמיד { ok, ... } או { ok:false, code }. */
export function createHomeDocuments(client, { timeoutMs = 8000 } = {}) {
  const bucket = () => client.storage.from(BUCKET);
  // בלי timeout, רשת תקועה משאירה את הממשק ב"בודק…" ללא הגבלה.
  const withTimeout = promise => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))]);
  return {
    /** המרחב המשותף שהמשתמש חבר בו. אין כזה (או שהטבלה עוד לא קיימת) = not_enabled. */
    async resolveWorkspaceId() {
      try {
        const { data, error } = await withTimeout(client.from("workspaces").select("id, owner_id").eq("kind", "shared").limit(1));
        if (error) return { ok: false, code: classify(error) };
        return data?.length ? { ok: true, workspaceId: data[0].id, ownerId: data[0].owner_id ?? null } : { ok: false, code: "not_enabled" };
      } catch { return { ok: false, code: "network" }; }
    },
    async upload(path, file, contentType) {
      try {
        const { error } = await bucket().upload(path, file, { contentType, upsert: false, cacheControl: "3600" });
        return error ? { ok: false, code: classify(error) } : { ok: true };
      } catch { return { ok: false, code: "network" }; }
    },
    async signedUrl(path, seconds = 90) {
      try {
        const { data, error } = await bucket().createSignedUrl(path, seconds);
        return error || !data?.signedUrl ? { ok: false, code: error ? classify(error) : "network" } : { ok: true, url: data.signedUrl };
      } catch { return { ok: false, code: "network" }; }
    },
    /** Storage מחזיר הצלחה עם רשימה ריקה כשה-RLS מונע מחיקה, לכן רשימה ריקה = forbidden. */
    async remove(path) {
      try {
        const { data, error } = await bucket().remove([path]);
        if (error) return { ok: false, code: classify(error) };
        return data?.length ? { ok: true } : { ok: false, code: "forbidden" };
      } catch { return { ok: false, code: "network" }; }
    },
  };
}
