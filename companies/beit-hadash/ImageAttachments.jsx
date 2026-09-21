"use client";
// תמונות להשראות ולרכש בבית חדש: העלאה מהגלריה/מצלמה ל-Storage הפרטי (home-documents), תמונות ממוזערות, תצוגה מוגדלת ומחיקה.
// אין fallback ל-base64: כשהאחסון לא מופעל, הכפתור נשאר גלוי ומציג הודעה. הלוגיקה הטהורה נמצאת ב-images.js.
import { useEffect, useRef, useState } from "react";
import { Camera, ImageOff, ImagePlus, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { IMAGE_ACCEPT_ATTR, createHomeDocuments } from "@/lib/home-documents";
import { JPEG_QUALITY, MAX_IMAGES, MAX_TEXT, NOT_ENABLED_TEXT, addImage, attachImage, createUrlCache, downscaledName, imagesOf, pathsOf, pathsToRemove, remainingSlots, removeImage, removeObjects, resolveWorkspaceCached, scaleDimensions, shouldDownscale } from "./images";

const api = createHomeDocuments(supabase);
const urls = createUrlCache(api);

/** מחיקה best-effort של אובייקטי תמונות (למשל כשמוחקים השראה או רכש). */
export const purgeImages = images => { removeObjects(api, pathsOf(images)); };

// כיווץ בקנבס: צלע ארוכה עד 1600, JPEG 0.82. HEIC וכשל בפענוח: הקובץ המקורי (הגודל נבדק אחרי זה).
async function downscaleFile(file, mime) {
  if (!shouldDownscale(mime)) return file;
  let src, w, h;
  if (typeof createImageBitmap === "function") { src = await createImageBitmap(file, { imageOrientation: "from-image" }); w = src.width; h = src.height; }
  else {
    const u = URL.createObjectURL(file);
    try { src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; }); } finally { URL.revokeObjectURL(u); }
    w = src.naturalWidth; h = src.naturalHeight;
  }
  const { width, height, scaled } = scaleDimensions(w, h);
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height); ctx.drawImage(src, 0, 0, width, height);
  src.close?.();
  const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", JPEG_QUALITY));
  if (!blob || (!scaled && blob.size >= file.size)) return file;
  return new File([blob], downscaledName(file.name), { type: "image/jpeg" });
}

/** עוקב אחרי העלאות בסשן עריכה, כדי לנקות יתומים בביטול ולמחוק תמונות שהוסרו רק אחרי שמירה. */
export function useImageTracker(initialImages) {
  const ref = useRef(null);
  if (!ref.current) {
    const t = { initial: pathsOf(initialImages), uploaded: new Set() };
    t.reset = images => { t.initial = pathsOf(images); t.uploaded = new Set(); };
    t.note = path => t.uploaded.add(path);
    t.settle = (finalImages, saved) => { removeObjects(api, pathsToRemove({ initial: t.initial, final: pathsOf(finalImages), uploaded: [...t.uploaded], saved })); t.initial = saved ? pathsOf(finalImages) : t.initial; t.uploaded = new Set(); };
    ref.current = t;
  }
  return ref.current;
}

function useSignedUrl(path) {
  const [state, setState] = useState({ url: "", failed: false });
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ url: "", failed: false });
    urls.get(path).then(r => { if (alive) setState(r.ok ? { url: r.url, failed: false } : { url: "", failed: true }); });
    return () => { alive = false; };
  }, [path, tries]);
  // תמונה שנכשלה (כתובת פגה): מרעננים פעם אחת ואז מציגים מקום שמור.
  const onError = () => { if (tries < 1) { urls.invalidate(path); setTries(t => t + 1); } else setState({ url: "", failed: true }); };
  return { ...state, onError };
}

const boxStyle = size => ({ width: size, height: size, borderRadius: 10, background: "#EEF2EF", border: "1px solid #DCE3DE", display: "grid", placeItems: "center", overflow: "hidden", color: "#63716A", flex: "none", boxSizing: "border-box" });

function Thumb({ image, size = 96, onOpen }) {
  const { url, failed, onError } = useSignedUrl(image.path);
  const inner = url ? <img src={url} alt={image.name || "תמונה"} onError={onError} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : failed ? <ImageOff size={22} aria-label="התמונה לא זמינה כרגע" /> : <span style={{ fontSize: 12 }}>טוען…</span>;
  return onOpen ? <button type="button" onClick={onOpen} aria-label={`פתיחת תמונה ${image.name || ""}`} style={{ ...boxStyle(size), padding: 0, cursor: "pointer" }}>{inner}</button> : <div style={boxStyle(size)}>{inner}</div>;
}

/** תמונה ממוזערת קטנה + מספר, לכרטיסים ברשימות. לא מציג כלום כשאין תמונות. */
export function ImageBadge({ entry, size = 44 }) {
  const images = imagesOf(entry);
  if (!images.length) return null;
  return <span aria-label={`${images.length} תמונות`} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#63716A", fontSize: 13 }}><Thumb image={images[0]} size={size} /><span>{images.length} תמונות</span></span>;
}

/** כל תמונות הרשומה כתמונות קטנות בכרטיס (לחיצה = תצוגה מוגדלת). */
export function ImageStrip({ entry, size = 72 }) {
  const images = imagesOf(entry); const [open, setOpen] = useState(null);
  if (!images.length) return null;
  return <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{images.map(im => <Thumb key={im.id} image={im} size={size} onOpen={() => setOpen(im)} />)}{open && <Lightbox image={open} onClose={() => setOpen(null)} />}</div>;
}

function Lightbox({ image, onClose }) {
  const [fresh, setFresh] = useState({ url: "", failed: false });
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    let alive = true;
    urls.invalidate(image.path); // תמיד כתובת טרייה לתצוגה גדולה
    urls.get(image.path).then(r => { if (alive) setFresh(r.ok ? { url: r.url, failed: false } : { url: "", failed: true }); });
    const onKey = e => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => { alive = false; window.removeEventListener("keydown", onKey); };
  }, [image.path]);
  return <div role="dialog" aria-modal="true" aria-label="תצוגת תמונה" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(10,16,13,.92)", display: "grid", placeItems: "center", padding: 12 }}>
    <button type="button" aria-label="סגירת התמונה" onClick={onClose} style={{ position: "absolute", top: 8, insetInlineEnd: 8, minWidth: 44, minHeight: 44, borderRadius: 22, border: 0, background: "rgba(255,255,255,.18)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}><X /></button>
    {fresh.url ? <img src={fresh.url} alt={image.name || "תמונה"} onClick={e => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "calc(100vh - 88px)", objectFit: "contain", borderRadius: 8 }} /> : <p style={{ color: "#fff", margin: 0 }}>{fresh.failed ? "התמונה לא זמינה כרגע. נסו שוב בעוד רגע" : "טוען…"}</p>}
  </div>;
}

/**
 * אזור התמונות בטופס עריכה. images/onChange: הרשימה בטיוטה. tracker: מ-useImageTracker (ניקוי יתומים).
 * הכפתורים מסומנים data-hq-edit="1" כדי שמצב קריאה-בלבד ינטרל אותם.
 */
export default function ImageAttachments({ images, onChange, tracker, label = "תמונות" }) {
  const list = imagesOf({ images });
  const [enabled, setEnabled] = useState("loading"); // loading | on | off
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(null);
  const pick = useRef(null), cam = useRef(null);
  const listRef = useRef(list); listRef.current = list;
  useEffect(() => { let alive = true; resolveWorkspaceCached(api).then(r => { if (alive) setEnabled(r.ok ? "on" : r.code === "not_enabled" ? "off" : "loading"); }); return () => { alive = false; }; }, []);
  const start = ref => { setMessage(""); if (enabled === "off") { setMessage(NOT_ENABLED_TEXT); return; } if (remainingSlots(list) <= 0) { setMessage(MAX_TEXT); return; } ref.current?.click(); };
  const onFiles = async e => {
    const files = [...(e.target.files || [])]; e.target.value = "";
    if (!files.length || busy) return;
    setBusy(true); setMessage("");
    let current = listRef.current, note = "";
    for (const file of files) {
      const r = await attachImage({ api, file, current, downscale: downscaleFile });
      if (!r.ok) { note = r.message; if (r.code === "not_enabled") setEnabled("off"); if (r.code === "max" || r.code === "not_enabled") break; continue; }
      tracker?.note(r.entry.path); current = addImage(current, r.entry); onChange(current);
    }
    setBusy(false); setMessage(note);
  };
  const del = image => {
    if (!window.confirm("למחוק את התמונה?")) return;
    // תמונה שהועלתה בסשן הזה ועוד לא נשמרה: נמחקת מיד. תמונה שמורה: יוצאת מהרשימה, והאובייקט נמחק רק בשמירה.
    if (tracker?.uploaded.has(image.path)) { removeObjects(api, [image.path]); tracker.uploaded.delete(image.path); }
    onChange(removeImage(list, image.id)); setMessage("");
  };
  const btn = { minHeight: 44, padding: "0 14px", borderRadius: 10, border: "1px solid #C9D3CC", background: "#fff", color: "#18231E", font: "inherit", display: "inline-flex", alignItems: "center", gap: 7, cursor: busy ? "not-allowed" : "pointer" };
  return <div style={{ display: "grid", gap: 8 }}>
    <div><strong>{label}</strong><span style={{ color: "#63716A", marginInlineStart: 8 }}>{list.length ? `${list.length} מתוך ${MAX_IMAGES}` : "אופציונלי"}</span></div>
    {list.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,96px)", justifyContent: "start", gap: 8 }}>
      {list.map(im => <div key={im.id} style={{ position: "relative", height: 96 }}>
        <Thumb image={im} size={96} onOpen={() => setOpen(im)} />
        <button type="button" data-hq-edit="1" aria-label="מחיקת תמונה" onClick={() => del(im)} style={{ position: "absolute", top: 0, insetInlineEnd: 0, minWidth: 44, minHeight: 44, border: 0, background: "transparent", display: "grid", placeItems: "center", cursor: "pointer" }}><span style={{ width: 28, height: 28, borderRadius: 14, background: "rgba(24,35,30,.72)", color: "#fff", display: "grid", placeItems: "center" }}><Trash2 size={15} /></span></button>
      </div>)}
    </div>}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" data-hq-edit="1" disabled={busy} onClick={() => start(pick)} style={btn}><ImagePlus size={18} />{busy ? "מעלה תמונה…" : "הוספת תמונה"}</button>
      <button type="button" data-hq-edit="1" disabled={busy} onClick={() => start(cam)} style={btn}><Camera size={18} />צילום</button>
      <input ref={pick} type="file" accept={IMAGE_ACCEPT_ATTR} multiple hidden onChange={onFiles} />
      <input ref={cam} type="file" accept={IMAGE_ACCEPT_ATTR} capture="environment" hidden onChange={onFiles} />
    </div>
    {message && <p role="alert" style={{ margin: 0, color: enabled === "off" ? "#63716A" : "#b42318", fontSize: 14 }}>{message}</p>}
    {open && <Lightbox image={open} onClose={() => setOpen(null)} />}
  </div>;
}
