"use client";
import { useEffect, useRef, useState } from "react";

// סליידר אישור: תגובה לפידבק ("קרוב מדי, קל ללחוץ בטעות") על כפתור "סמן כנרכש" הקודם.
// גרסה שנייה: הגרסה הראשונה נבנתה על <input type="range"> וב-בדיקה אמיתית בטלפון הידית
// לא הגיבה בכלל לנגיעה - כנראה קונפליקט בין העיצוב המותאם (-webkit-appearance:none) לבין
// טיפול המגע המובנה של הדפדפן בטווח. כאן הגרירה ממומשת ידנית לגמרי עם Pointer Events
// (pointerdown/move/up, עם setPointerCapture כדי שהגרירה תמשיך גם אם האצבע זזה מחוץ
// לגבולות המדויקים של האלמנט) - בלי להסתמך על טיפול מגע מובנה של אף דפדפן, ולכן אין
// קונפליקט אפשרי מהסוג הזה. touch-action:none על המסלול מבטל כל טיפול מגע ברירת מחדל של
// הדפדפן עליו (כולל גלילת העמוד דרכו), כדי שלא תהיה תחרות בין הדפדפן ל-JS על אותו מגע.
// נגישות: role="slider" + aria-value* + ArrowLeft/ArrowRight/Enter במקלדת - לא "בחינם" כמו
// input[type=range], אבל ממומש ידנית כאן במפורש.
const THRESHOLD = 0.8; // 80% מהמרחק - פחות מהגרסה הקודמת (85%), כדי שגרירה אמיתית של אגודל שלא מגיעה בדיוק לקצה עדיין תיחשב
const THUMB = 44;
const STEP = 0.1;

export default function SwipeConfirm({ label = "החליקו לאישור רכישה", confirmedLabel = "נרכש", onConfirm, disabled }) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const firedRef = useRef(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [dragging, setDragging] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const fire = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    setProgress(1);
    setConfirmed(true);
    onConfirm?.();
  };

  // בודק סף גם מחוץ לגרירה עצמה (למשל אחרי חץ מקלדת), לא רק ב-pointerup.
  // אפסילון קטן נגד שגיאת נקודה צפה: 8 לחיצות של STEP=0.1 מצטברות ל-0.7999999999999999,
  // לא 0.8 בדיוק - בלי זה המשתמש "תקוע" בדיוק על ה-80% המוצג במקלדת בלי שהאישור יורה.
  useEffect(() => {
    if (progress >= THRESHOLD - 1e-9 && !firedRef.current) fire();
  }, [progress]); // eslint-disable-line

  const progressFromClientX = clientX => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const travel = Math.max(1, rect.width - THUMB);
    // RTL: 0 בקצה הימני של המסלול, 1 בקצה השמאלי - "גרירה שמאלה" מגדילה את ההתקדמות.
    const p = (rect.right - THUMB / 2 - clientX) / travel;
    return Math.min(1, Math.max(0, p));
  };

  const onPointerDown = e => {
    if (disabled || confirmed) return;
    draggingRef.current = true;
    setDragging(true);
    // try/catch: יכול לזרוק NotFoundError אם הדפדפן כבר לא רואה pointer פעיל עם ה-id הזה
    // (למשל pointerdown סינתטי/מהיר) - לא קריטי לגרירה עצמה, רק מבטיח שהיא ממשיכה גם
    // כשהאצבע יוצאת מגבולות האלמנט.
    try { trackRef.current?.setPointerCapture?.(e.pointerId); } catch { /* לא קריטי */ }
    setProgress(progressFromClientX(e.clientX));
  };
  const onPointerMove = e => {
    if (!draggingRef.current) return;
    setProgress(progressFromClientX(e.clientX));
  };
  const endDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    setProgress(p => {
      if (p >= THRESHOLD) return p; // ה-effect למעלה כבר מטפל באישור; לא לאפס תוך כדי
      return 0;
    });
  };

  const onKeyDown = e => {
    if (disabled || confirmed) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); setProgress(p => Math.min(1, Math.round((p + STEP) * 100) / 100)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setProgress(p => Math.max(0, Math.round((p - STEP) * 100) / 100)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); }
  };

  if (confirmed) return <div className="hq-swipe-confirmed" role="status">{confirmedLabel}</div>;

  return (
    <div
      ref={trackRef} className="hq-swipe-confirm" role="slider" tabIndex={disabled ? -1 : 0}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={label}
      aria-disabled={disabled || undefined}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      style={{ "--p": progress, touchAction: "none", cursor: disabled ? "not-allowed" : dragging ? "grabbing" : "grab" }}
    >
      <div className="hq-swipe-fill" />
      <span className="hq-swipe-track-label">{label}</span>
      <div className="hq-swipe-thumb" style={{ transition: dragging ? "none" : "inset-inline-start 180ms ease" }} />
    </div>
  );
}
