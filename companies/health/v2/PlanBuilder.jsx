"use client";
import { useMemo, useState } from "react";
import { importFromText } from "../plan.mjs";
import css from "./health-v2.module.css";

const EXAMPLE = `A
שם תרגיל | 3 | 8-12 | 40
שם תרגיל נוסף | 3 | 8-12
B
שם תרגיל | 4 | 6-8 | 22.5`;

// בונה תוכנית: הזנה/ייבוא מהיר מטקסט (למשל נתונים שיגיעו מ-Hevy), או בנייה ידנית בעורך.
// לא מכיל תרגילים או משקלים משלו.
export default function PlanBuilder({ onLoad, onManual, onClose }) {
  const [text, setText] = useState("");
  const result = useMemo(() => (text.trim() ? importFromText(text, new Date().toISOString()) : null), [text]);
  const count = result?.program ? Object.values(result.program.sessions).reduce((n, l) => n + l.length, 0) : 0;
  return <div className={css.stack}>
    <div className={css.sectionHead}><h2>בניית תוכנית</h2><button className={css.linkButton} onClick={onClose}>ביטול</button></div>
    <section className={css.card + " " + css.stack}>
      <h3>הזנה או ייבוא מהיר</h3>
      <p className={css.subtle}>כותרת לכל אימון (A, B או C), ומתחתיה שורה לכל תרגיל: שם, סטים, טווח חזרות, ומשקל התחלה אם ידוע. משקל חסר נשאר ריק. אחרי הטעינה אפשר לערוך הכול.</p>
      <label className={css.pbLabel}>התוכנית<textarea className={css.field + " " + css.pbText} rows={10} dir="rtl" value={text} onChange={e => setText(e.target.value)} placeholder={EXAMPLE} /></label>
      {result && result.errors.length > 0 && <div className={css.pbErrors} role="alert"><strong>{count ? "השורות האלה לא ייטענו:" : "אי אפשר לטעון עדיין:"}</strong><ul>{result.errors.map((e, i) => <li key={i}>{e.line ? `שורה ${e.line}: ` : ""}{e.message}</li>)}</ul></div>}
      {result?.program && <p className={css.subtle}>מוכן לטעינה: {Object.keys(result.program.sessions).length} אימונים, {count} תרגילים.</p>}
      <button className={css.primary} disabled={!result?.program} onClick={() => onLoad(result.program)}>טעינה כבסיס לעריכה</button>
    </section>
    <section className={css.card + " " + css.stack}>
      <h3>בנייה ידנית</h3>
      <p className={css.subtle}>מתחילים מריק ומוסיפים תרגילים, סטים, חזרות ומשקל אחד אחד.</p>
      <button className={css.secondary} onClick={onManual}>התחלה מתוכנית ריקה</button>
    </section>
  </div>;
}
