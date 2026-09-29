"use client";
import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { CARD, GREEN } from "@/lib/theme";

// שורת פריט "ניתנת להחלקה" בסגנון אפליקציית ההודעות של iOS: השורה עצמה (לא רכיב נוסף
// מתחתיה) היא הסליידר. גרסה קודמת הוסיפה בר סליידר נפרד מתחת לכל שורה - פידבק מפורש:
// "לא צריך להוסיף בר סליידר אלא השורה עצמה היא סליידר". כאן: גרירת ה-children (תוכן
// השורה) שמאלה חושפת רקע ירוק עם "נרכש" שהיה מוסתר מאחוריה; שחרור אחרי סף מאשר, לפני
// הסף מחזיר למקום. הקשה רגילה (טוגל פתיחה, כפתורי restore/chevron בתוך children) ממשיכה
// לעבוד כרגיל - התערבות בג'סטורה מתחילה רק אחרי שחצינו סף תזוזה אופקי מובהק.
const THRESHOLD_RATIO = 0.42; // חלק מ-maxDrag (לא מרוחב השורה המלאה - ראו MAX_DRAG למטה)
const MAX_DRAG_RATIO = 0.55; // כמה מרוחב השורה אפשר לגרור בפועל בפועל
const MAX_DRAG_PX = 220; // ותקרה מוחלטת, כדי שבמסך רחב (דסקטופ) לא יידרש מרחק גרירה עצום
const MOVE_THRESHOLD = 6; // px - כמה תזוזה לפני שמחליטים שזו גרירה אופקית ולא הקשה/גלילה

export default function SwipeConfirm({ onConfirm, disabled, children, revealLabel = "נרכש", ariaLabel }) {
  const wrapRef = useRef(null);
  const startRef = useRef(null); // {x, y, maxDrag} | null
  const draggingRef = useRef(false); // חצינו את סף התזוזה - זו גרירה אופקית ממשית
  const dxRef = useRef(0);
  const justDraggedRef = useRef(false); // מדכא click שמגיע מיד אחרי גרירה (גם כזו שחזרה ל-0)
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const clampDx = (raw, maxDrag) => Math.min(0, Math.max(-maxDrag, raw));

  const onPointerDown = e => {
    if (disabled) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    const maxDrag = Math.min(MAX_DRAG_PX, (rect?.width || 300) * MAX_DRAG_RATIO);
    startRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, maxDrag };
    draggingRef.current = false;
    // לא תופסים pointer capture כאן במכוון - רק כשמתברר בפועל שזו גרירה אופקית
    // (ב-onPointerMove), כדי שהקשה רגילה על תוכן השורה תמשיך לעבוד בלי הפרעה.
  };

  const onPointerMove = e => {
    const start = startRef.current;
    if (!start) return;
    const moveX = e.clientX - start.x;
    const moveY = e.clientY - start.y;
    if (!draggingRef.current) {
      if (Math.abs(moveX) < MOVE_THRESHOLD && Math.abs(moveY) < MOVE_THRESHOLD) return;
      if (Math.abs(moveY) > Math.abs(moveX)) { startRef.current = null; return; } // גלילה אנכית - משאירים לדפדפן
      draggingRef.current = true;
      setDragging(true);
      try { wrapRef.current?.setPointerCapture?.(e.pointerId); } catch { /* לא קריטי */ }
    }
    e.preventDefault();
    const clamped = clampDx(moveX, start.maxDrag);
    dxRef.current = clamped;
    setDx(clamped);
  };

  const endDrag = () => {
    const start = startRef.current;
    const wasDragging = draggingRef.current;
    const finalDx = dxRef.current;
    startRef.current = null;
    draggingRef.current = false;
    setDragging(false);
    if (!wasDragging || !start) { dxRef.current = 0; setDx(0); return; }
    justDraggedRef.current = true;
    queueMicrotask(() => { justDraggedRef.current = false; });
    if (-finalDx >= start.maxDrag * THRESHOLD_RATIO) {
      onConfirm?.(); // השורה תיעלם מהרשימה עם עדכון ה-state אצל ההורה - אין צורך לאפס dx
    } else {
      dxRef.current = 0;
      setDx(0);
    }
  };

  const onClickCapture = e => {
    if (justDraggedRef.current) { e.preventDefault(); e.stopPropagation(); }
  };

  return (
    <div ref={wrapRef} className="hq-swipe-row">
      <div className="hq-swipe-reveal" aria-hidden="true" style={{ background: GREEN }}>
        <Check size={16} /> {revealLabel}
      </div>
      <div
        className={`hq-swipe-content${dragging ? " dragging" : ""}`}
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? "none" : "transform 200ms ease", background: CARD }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
      {/* חלופה נגישה למקלדת/קורא מסך: מוסתרת חזותית ומופיעה רק ב-focus (כמו קישור "דלג
          לתוכן") - לא יוצרת מטרת-נגיעה נוספת למשתמשי עכבר/מגע, ולכן לא חוזרת לבעיה
          המקורית ("כפתור קטן קרוב מדי, קל ללחוץ בטעות"). */}
      {!disabled && (
        <button type="button" className="hq-swipe-a11y" onClick={() => onConfirm?.()} aria-label={ariaLabel || "סימון כנרכש"}>
          <Check size={14} /> סימון כנרכש
        </button>
      )}
    </div>
  );
}
