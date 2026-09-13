"use client";
import { useState } from "react";
import { MUTED, cardStyle, inputStyle, primaryBtn } from "@/lib/theme";
import { saveCv, clearCv } from "./model";
import styles from "./career.module.css";

// מסך קורות חיים — טקסט בלבד (לא קובץ). במוצר הישן היה העלאת PDF עם חילוץ
// טקסט אוטומטי; כאן, עד שתתחבר יכולת דומה, מדביקים את הטקסט ידנית. הטקסט הזה
// משמש כבסיס למסכי "הכנה לראיון" ברגע שהם יתחברו ל-AI.
export default function CV({ state, setData }) {
  const cv = state.cv || { filename: "", text: "", uploadedAt: "" };
  const [filename, setFilename] = useState(cv.filename);
  const [text, setText] = useState(cv.text);
  const [error, setError] = useState("");
  const dirty = filename !== cv.filename || text !== cv.text;

  function save() {
    setError("");
    try { setData(prev => saveCv(prev, { filename, text })); }
    catch (failure) { setError(failure.message); }
  }
  function remove() {
    setData(prev => clearCv(prev));
    setFilename(""); setText("");
  }

  return (
    <div>
      <p style={{ color: MUTED }}>הטקסט משמש בעתיד לניתוח התאמה, הכנת CV ומכתב מותאמים, ותשובות מותאמות אישית — כרגע נשמר כאן לקריאה ועריכה בלבד.</p>
      <div style={{ ...cardStyle, padding: 16 }}>
        <label className={styles.field}>
          <span>שם הקובץ (לתיעוד בלבד)</span>
          <input className="hq-field" style={inputStyle} value={filename} onChange={e => setFilename(e.target.value)} placeholder="לדוגמה: קורות_חיים.pdf" />
        </label>
        <label className={styles.field}>
          <span>טקסט קורות החיים</span>
          <textarea className="hq-field" style={inputStyle} rows={16} maxLength={20000} value={text} onChange={e => setText(e.target.value)} placeholder="הדביקו כאן את טקסט קורות החיים המלא..." />
        </label>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button style={primaryBtn} className={styles.button} disabled={!dirty} onClick={save}>שמירה</button>
          {cv.text && <button className={styles.button} onClick={remove}>הסרת קורות חיים</button>}
        </div>
        {cv.uploadedAt && <p style={{ color: MUTED, fontSize: 12 }}>עודכן לאחרונה: {new Date(cv.uploadedAt).toLocaleDateString("he-IL")}</p>}
      </div>
    </div>
  );
}
