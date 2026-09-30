"use client";
import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { CARD, GREEN } from "@/lib/theme";

// שורת פריט "ניתנת להחלקה" בסגנון אפליקציית ההודעות של iOS: השורה עצמה (לא רכיב נוסף
// מתחתיה) היא הסליידר. גרירת ה-children (תוכן השורה) שמאלה חושפת רקע ירוק עם "נרכש"
// שהיה מוסתר מאחוריה; שחרור אחרי סף מאשר, לפני הסף מחזיר למקום.
//
// באג אמיתי שנתפס בבדיקה בטלפון אמיתי (לא שוחזר בבדיקה בדפדפן/אמולציה!): עם
// touch-action:pan-y, מנגנון הגלילה האנכית הטבעי של המערכת "מתחרה" על הג'סטורה מול ה-JS
// - ברוב המגעים האמיתיים יש רכיב אנכי קטן גם בגרירה אופקית מכוונת, ולפעמים המערכת "זוכה"
// באמצע הגרירה ומפסיקה למסור pointermove ל-JS בכלל (בלי pointercancel אפילו) - בדיוק
// התסמין שדווח: "מתחיל לראות ירוק אבל תקוע". התיקון: touch-action:none מבטל לגמרי את
// הטיפול הטבעי של המערכת בכל מגע שמתחיל על האלמנט הזה, כך שאין תחרות בכלל - כל המגע עובר
// דרכנו. המחיר: גלילה אנכית שמתחילה בדיוק על שורת פריט כבר לא "בחינם" מהדפדפן, אז
// ממומשת כאן ידנית (window.scrollBy) ברגע שמתברר שהג'סטורה בעצם אנכית.
const THRESHOLD_RATIO = 0.42; // חלק מ-maxDrag (לא מרוחב השורה המלאה - ראו MAX_DRAG למטה)
const MAX_DRAG_RATIO = 0.55; // כמה מרוחב השורה אפשר לגרור בפועל
const MAX_DRAG_PX = 220; // תקרה מוחלטת, כדי שבמסך רחב (דסקטופ) לא יידרש מרחק גרירה עצום
const LOCK_THRESHOLD = 8; // px - תזוזה כוללת לפני שנועלים כיוון (x=גרירה / y=גלילה) ולא זזים ממנו

export default function SwipeConfirm({ onConfirm, disabled, children, revealLabel = "נרכש", ariaLabel }) {
  const wrapRef = useRef(null);
  const startRef = useRef(null); // {x, y, lastY, maxDrag} | null
  const lockRef = useRef(null); // null (עוד לא הוכרע) | "x" (גרירה) | "y" (גלילה)
  const dxRef = useRef(0);
  const justDraggedRef = useRef(false); // מדכא click שמגיע מיד אחרי גרירה (גם כזו שחזרה ל-0)
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const clampDx = (raw, maxDrag) => Math.min(0, Math.max(-maxDrag, raw));

  const onPointerDown = e => {
    if (disabled) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    const maxDrag = Math.min(MAX_DRAG_PX, (rect?.width || 300) * MAX_DRAG_RATIO);
    startRef.current = { x: e.clientX, y: e.clientY, lastY: e.clientY, maxDrag };
    lockRef.current = null;
    // לא תופסים pointer capture כאן במכוון - רק כשמתברר בפועל שזו גרירה אופקית (ב-move),
    // כדי שהקשה רגילה על תוכן השורה (טוגל פתיחה, כפתורי restore/chevron) תמשיך לעבוד.
  };

  const onPointerMove = e => {
    const start = startRef.current;
    if (!start) return;
    const moveX = e.clientX - start.x;
    const moveY = e.clientY - start.y;

    if (lockRef.current === null) {
      if (Math.abs(moveX) < LOCK_THRESHOLD && Math.abs(moveY) < LOCK_THRESHOLD) return;
      lockRef.current = Math.abs(moveX) > Math.abs(moveY) ? "x" : "y";
      if (lockRef.current === "x") {
        setDragging(true);
        try { wrapRef.current?.setPointerCapture?.(e.pointerId); } catch { /* לא קריטי */ }
      }
    }

    if (lockRef.current === "y") {
      // ראו הערה למעלה: touch-action:none ביטל את הגלילה הטבעית, אז מבצעים אותה ידנית.
      const dy = e.clientY - start.lastY;
      start.lastY = e.clientY;
      window.scrollBy(0, -dy);
      return;
    }

    e.preventDefault();
    const clamped = clampDx(moveX, start.maxDrag);
    dxRef.current = clamped;
    setDx(clamped);
  };

  const endDrag = () => {
    const start = startRef.current;
    const wasDragging = lockRef.current === "x";
    const finalDx = dxRef.current;
    startRef.current = null;
    lockRef.current = null;
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
          לתוכן") - לא יוצרת מטרת-נגיעה נוספת למשתמשי עכבר/מגע. */}
      {!disabled && (
        <button type="button" className="hq-swipe-a11y" onClick={() => onConfirm?.()} aria-label={ariaLabel || "סימון כנרכש"}>
          <Check size={14} /> סימון כנרכש
        </button>
      )}
    </div>
  );
}
