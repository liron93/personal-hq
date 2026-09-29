"use client";
import { useRef, useState } from "react";

// סליידר אישור: תגובה לפידבק ("קרוב מדי, קל ללחוץ בטעות") על כפתור "סמן כנרכש" הקודם.
// גרירה מכוונת מדרישה לאישור, ולא לחיצה חד-פעמית קלה. <input type="range"> נבחר בכוונה
// (לא div מותאם עם pointer events בלבד) כדי לקבל בחינם: מקלדת (חצים), מגע, עכבר, ותמיכת
// קוראי מסך - כל אלה כבר קיימים ב-input מסוג range. ב-RTL, "גרירה שמאלה" = מילוי הסליידר
// מהצד הימני (ההתחלה, כמו טקסט עברי) שמאלה (הסוף) - dir="rtl" על ה-input גורם לדפדפן
// למלא בכיוון הזה. אישור קורה כשהערך חוצה סף (לא בלחיצה בודדת על הפס: לחיצה רגילה על
// track רחב שמזיזה את היד ישר לסף היא עדיין גרירה מכוונת של אצבע לנקודה ספציפית, לא נגיעה
// מקרית קטנה כמו כפתור צר).
const THRESHOLD = 85;

export default function SwipeConfirm({ label = "החליקו לאישור רכישה", confirmedLabel = "בוצע", onConfirm, disabled }) {
  const [value, setValue] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const firedRef = useRef(false);

  const reset = () => { setValue(0); firedRef.current = false; };
  const release = () => { if (!firedRef.current) reset(); };

  const onChange = e => {
    const next = Number(e.target.value);
    setValue(next);
    if (next >= THRESHOLD && !firedRef.current) {
      firedRef.current = true;
      setConfirmed(true);
      onConfirm?.();
      // לא מאפסים חזרה ל-0 בעריכת state כאן: הרכיב מוסר/מוחלף על ידי ההורה ברגע שהפריט עבר
      // ל"נרכש" (משתנה tab/סינון), כך שאין "קפיצה" חזותית - אם בכל זאת נשאר על המסך, מציג
      // "בוצע" קבוע במקום הסליידר.
    }
  };

  if (confirmed) {
    return <div className="hq-swipe-confirmed" role="status">{confirmedLabel}</div>;
  }

  return (
    <div className="hq-swipe-confirm" aria-label={label}>
      <span className="hq-swipe-track-label">{label}</span>
      <input
        type="range" dir="rtl" min={0} max={100} step={1} value={value}
        disabled={disabled}
        aria-label={label}
        onChange={onChange}
        onPointerUp={release}
        onTouchEnd={release}
        onMouseUp={release}
        onBlur={release}
        onKeyUp={e => { if (e.key === "Enter" || e.key === " ") { setValue(100); onChange({ target: { value: 100 } }); } }}
        style={{ "--hq-swipe-pct": `${value}%` }}
      />
    </div>
  );
}
