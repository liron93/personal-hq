"use client";
import { useMemo, useState } from "react";
import { importFromText } from "../plan.mjs";
import css from "./health-v2.module.css";

const EXAMPLE = `A
שם תרגיל | 3 | 8-12 | 20/20/15
תרגיל נוסף | 3 | 12 | טרם נקבע
B
Exercise Name (Variant) | 2 | 10 | 12.5`;

// בונה תוכנית: הזנה/ייבוא מהיר מטקסט (למשל נתונים שיגיעו מ-Hevy), או בנייה ידנית בעורך.
// לא מכיל תרגילים או משקלים משלו.
export default function PlanBuilder({ onLoad, onManual, onClose, hasExisting }) {
  const [confirm, setConfirm] = useState(false);
  const [text, setText] = useState("");
  const result = useMemo(() => (text.trim() ? importFromText(text, new Date().toISOString()) : null), [text]);
  const count = result?.program ? Object.values(result.program.sessions).reduce((n, l) => n + l.length, 0) : 0;
  return <div className={css.stack}>
    <div className={css.sectionHead}><h2>בניית תוכנית</h2><button className={css.linkButton} onClick={onClose}>ביטול</button></div>
    <section className={css.card + " " + css.stack}>
      <h3>הזנה או ייבוא מהיר</h3>
      <p className={css.subtle}>כותרת לכל אימון (A, B או C), ומתחתיה שורה לכל תרגיל: <bdi dir="ltr">שם | סטים | חזרות | משקל</bdi>. חזרות: 8-12 או 12. משקל: מספר אחד לכל הסטים, או רשימה עם / באורך מספר הסטים (למשל 70/70/60). ריק או "טרם נקבע" = לא נקבע, ולא מנחשים. שורה שגויה לא נטענת. אחרי הטעינה אפשר לערוך הכול.</p>
      <label className={css.pbLabel}>התוכנית<textarea className={css.field + " " + css.pbText} rows={10} dir="rtl" value={text} onChange={e => setText(e.target.value)} placeholder={EXAMPLE} /></label>
      {result && result.errors.length > 0 && <div className={css.pbErrors} role="alert"><strong>{count ? "השורות האלה לא ייטענו:" : "אי אפשר לטעון עדיין:"}</strong><ul>{result.errors.map((e, i) => <li key={i}>{e.line ? `שורה ${e.line}: ` : ""}{e.message}</li>)}</ul></div>}
      {result?.program && <p className={css.subtle}>מוכן לטעינה: {Object.keys(result.program.sessions).length} אימונים, {count} תרגילים.</p>}
      <button className={css.primary} disabled={!result?.program} onClick={() => (hasExisting ? setConfirm(true) : onLoad(result.program))}>טעינה כבסיס לעריכה</button>
      {confirm && <div className={css.modalBack} role="presentation"><div className={css.modal} role="alertdialog" aria-modal="true" aria-labelledby="replace-title"><h3 id="replace-title">להחליף את התוכנית הקיימת?</h3><p className={css.subtle}>כבר שמורה תוכנית. הטעינה תחליף אותה. עותק של התוכנית הקודמת יישמר בצד.</p><button className={css.primary} onClick={() => { setConfirm(false); onLoad(result.program); }}>כן, להחליף</button><button className={css.secondary} autoFocus onClick={() => setConfirm(false)}>ביטול, להשאיר את הקיימת</button></div></div>}
    </section>
    <section className={css.card + " " + css.stack}>
      <h3>{hasExisting ? "עריכה ידנית" : "בנייה ידנית"}</h3>
      <p className={css.subtle}>{hasExisting ? "עורכים את התוכנית הקיימת ישירות." : "מתחילים מריק ומוסיפים תרגילים, סטים, חזרות ומשקל אחד אחד."}</p>
      <button className={css.secondary} onClick={onManual}>{hasExisting ? "לעריכת התוכנית" : "התחלה מתוכנית ריקה"}</button>
    </section>
  </div>;
}
