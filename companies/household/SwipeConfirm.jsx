"use client";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { CARD, GREEN } from "@/lib/theme";

// שורת פריט "ניתנת להחלקה" בסגנון אפליקציית ההודעות של iOS: השורה עצמה (לא רכיב נוסף
// מתחתיה) היא הסליידר. גרירת ה-children (תוכן השורה) שמאלה חושפת רקע ירוק עם "נרכש"
// שהיה מוסתר מאחוריה; שחרור אחרי סף מאשר, לפני הסף מחזיר למקום.
//
// גרסה רביעית - שינוי גישה, לא רק כיוונון: הגרסאות הקודמות ניסו לפתור "תקוע באמצע גרירה"
// דרך touch-action (pan-y מול none) והניחו שהבעיה היא תחרות עם גלילה טבעית - אבל גם
// touch-action:none (שאמור לבטל כל תחרות כזו) לא פתר את זה בפועל, כלומר ההנחה הייתה כנראה
// שגויה. כאן המעבר הוא ליסודי יותר: Pointer Events (onPointerDown/Move/Up כ-props של React)
// הוחלפו באירועי מגע (touchstart/touchmove/touchend) נטיביים עם addEventListener ישיר על
// ה-DOM, לא דרך מערכת ה-synthetic events של React. הסיבה: יש הבדל תיעודי בין רמת הבשלות/
// יציבות של Touch Events (קיימים ב-iOS Safari מ-2008) לעומת Pointer Events (נוספו ב-iOS 13,
// עם היסטוריה של אי-עקביות ב-WebKit, כולל סביב touch-action ו-preventDefault). Touch Events
// עם { passive:false } מפורש מבטיח ש-preventDefault תמיד אפקטיבי, בלי תלות בברירת המחדל של
// הדפדפן/React לאירועי מגע. Pointer Events (mouse בלבד, מסונן לפי e.pointerType) נשארים
// כנתיב נפרד לבדיקה בעכבר/דסקטופ - אין כפילות כי מגע אמיתי עובר רק דרך touch events, ו-
// pointerType==="touch" מסונן החוצה בנתיב ה-pointer.
const THRESHOLD_RATIO = 0.42; // חלק מ-maxDrag (לא מרוחב השורה המלאה - ראו MAX_DRAG למטה)
const MAX_DRAG_RATIO = 0.55; // כמה מרוחב השורה אפשר לגרור בפועל
const MAX_DRAG_PX = 220; // תקרה מוחלטת, כדי שבמסך רחב (דסקטופ) לא יידרש מרחק גרירה עצום
const MOVE_THRESHOLD = 6; // px - כמה תזוזה לפני שמחליטים שזו גרירה אופקית ולא הקשה/גלילה

export default function SwipeConfirm({ onConfirm, disabled, children, revealLabel = "נרכש", ariaLabel }) {
  const wrapRef = useRef(null);
  const contentRef = useRef(null);
  const startRef = useRef(null); // {x, y, maxDrag} | null
  const draggingRef = useRef(false); // חצינו את סף התזוזה - זו גרירה אופקית ממשית
  const dxRef = useRef(0);
  const justDraggedRef = useRef(false); // מדכא click שמגיע מיד אחרי גרירה (גם כזו שחזרה ל-0)
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  // refs במקום תלות ב-deps של ה-effect - כדי שרישום המאזינים הנטיביים יקרה פעם אחת בלבד
  // (mount), לא בכל שינוי של onConfirm/disabled בין רינדורים.
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const clampDx = (raw, maxDrag) => Math.min(0, Math.max(-maxDrag, raw));

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const beginDrag = (x, y) => {
      if (disabledRef.current) return;
      const rect = wrapRef.current?.getBoundingClientRect();
      const maxDrag = Math.min(MAX_DRAG_PX, (rect?.width || 300) * MAX_DRAG_RATIO);
      startRef.current = { x, y, maxDrag };
      draggingRef.current = false;
    };

    const moveDrag = (x, y, ev) => {
      const start = startRef.current;
      if (!start) return;
      const moveX = x - start.x;
      const moveY = y - start.y;
      if (!draggingRef.current) {
        if (Math.abs(moveX) < MOVE_THRESHOLD && Math.abs(moveY) < MOVE_THRESHOLD) return;
        if (Math.abs(moveY) > Math.abs(moveX)) { startRef.current = null; return; } // גלילה אנכית - משאירים לדפדפן
        draggingRef.current = true;
        setDragging(true);
      }
      if (ev?.cancelable) ev.preventDefault();
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
        onConfirmRef.current?.(); // השורה תיעלם מהרשימה עם עדכון ה-state אצל ההורה
      } else {
        dxRef.current = 0;
        setDx(0);
      }
    };

    // --- מגע אמיתי: touchstart/move/end נטיביים, לא Pointer Events ---
    // { passive:false } על touchmove בלבד (חובה כדי ש-preventDefault יעבוד); touchstart/end
    // יכולים להישאר passive כי אין בהם preventDefault.
    const onTouchStart = e => { const t = e.touches[0]; if (t) beginDrag(t.clientX, t.clientY); };
    const onTouchMove = e => { const t = e.touches[0]; if (t) moveDrag(t.clientX, t.clientY, e); };
    const onTouchEnd = () => endDrag();

    // --- עכבר/דסקטופ: Pointer Events, מסונן ל-mouse בלבד (מגע אמיתי עובר רק למעלה) ---
    const onPointerDown = e => { if (e.pointerType === "touch") return; beginDrag(e.clientX, e.clientY); };
    const onPointerMove = e => { if (e.pointerType === "touch") return; moveDrag(e.clientX, e.clientY, e); };
    const onPointerUp = e => { if (e.pointerType === "touch") return; endDrag(); };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  }, []); // eslint-disable-line -- ראו onConfirmRef/disabledRef למעלה

  const onClickCapture = e => {
    if (justDraggedRef.current) { e.preventDefault(); e.stopPropagation(); }
  };

  return (
    <div ref={wrapRef} className="hq-swipe-row">
      <div className="hq-swipe-reveal" aria-hidden="true" style={{ background: GREEN }}>
        <Check size={16} /> {revealLabel}
      </div>
      <div
        ref={contentRef}
        className={`hq-swipe-content${dragging ? " dragging" : ""}`}
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? "none" : "transform 200ms ease", background: CARD }}
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
