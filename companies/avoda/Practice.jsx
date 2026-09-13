"use client";
import { useState } from "react";
import { MUTED, GREEN, cardStyle, inputStyle } from "@/lib/theme";
import { togglePracticed } from "./model";
import { CATEGORIES, DIFFICULTY_LABELS, selectQuestions } from "./practice-state";
import styles from "./career.module.css";

const DIFFICULTY_COLOR = { easy: GREEN, medium: "#C98A1B", hard: "#C23B3B" };

function QuestionCard({ q, practiced, onToggle }) {
  const [open, setOpen] = useState(false);
  return (
    <article style={cardStyle} className={styles.job}>
      <div className={styles.toolbar}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={!!practiced} onChange={e => onToggle(q.id, e.target.checked)} />
          תרגלתי
        </label>
        <span className={styles.badge} style={{ color: DIFFICULTY_COLOR[q.difficulty] }}>{DIFFICULTY_LABELS[q.difficulty] || q.difficulty}</span>
      </div>
      <p style={{ fontSize: 15, margin: "8px 0" }}>{q.question}</p>
      <p style={{ color: MUTED, fontSize: 12 }}>{q.category}{q.subcategory ? ` · ${q.subcategory}` : ""}</p>
      {(q.hint || q.question_type === "multiple_choice") && (
        <details className={styles.job} open={open} onToggle={e => setOpen(e.target.open)}>
          <summary>{open ? "▼ הסתר" : "▶ הצג רמז/תשובה"}</summary>
          {q.hint && <p className={styles.text} style={{ marginTop: 8 }}>{q.hint}</p>}
          {q.question_type === "multiple_choice" && (
            <div style={{ marginTop: 8 }}>
              <ul>
                {(q.options || []).map(opt => (
                  <li key={opt} style={{ fontWeight: opt === q.correct_answer ? 600 : 400, color: opt === q.correct_answer ? GREEN : undefined }}>{opt}</li>
                ))}
              </ul>
              {q.explanation && <p className={styles.text}>{q.explanation}</p>}
            </div>
          )}
        </details>
      )}
    </article>
  );
}

// בנק שאלות התרגול — ללא AI פעיל. מסמנים "תרגלתי" ידנית, ופותחים רמז/תשובה
// נכונה כשקיימת (שאלות אמריקאיות). הערכת תשובות פתוחות ב-AI זה שלב הבא.
export default function Practice({ state, setData }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [onlyUnpracticed, setOnlyUnpracticed] = useState(false);
  const items = selectQuestions(state.practiced, query, category, onlyUnpracticed);

  const toggle = (id, value) => setData(prev => togglePracticed(prev, id, value));

  return (
    <div>
      <div className={styles.grid}>
        <label className={styles.field}><span>חיפוש</span>
          <input className="hq-field" style={inputStyle} type="search" value={query} onChange={e => setQuery(e.target.value)} />
        </label>
        <label className={styles.field}><span>קטגוריה</span>
          <select className="hq-field" style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="all">כל הקטגוריות</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, margin: "8px 0 16px" }}>
        <input type="checkbox" checked={onlyUnpracticed} onChange={e => setOnlyUnpracticed(e.target.checked)} />
        הצג רק שאלות שלא תרגלתי
      </label>
      <p style={{ color: MUTED }}>{items.length} שאלות</p>
      {items.map(q => <QuestionCard key={q.id} q={q} practiced={!!state.practiced?.[q.id]} onToggle={toggle} />)}
    </div>
  );
}
