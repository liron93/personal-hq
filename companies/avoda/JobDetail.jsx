"use client";
import { useState } from "react";
import { MUTED, GREEN, RUST, cardStyle, inputStyle, primaryBtn } from "@/lib/theme";
import { STATUSES, saveJob } from "./model";
import styles from "./career.module.css";

function FitMeter({ score, shouldApply }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 2 }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} style={{ height: 6, width: 12, borderRadius: 4, background: i < (score ?? 0) ? GREEN : "#E2E5EA" }} />
        ))}
      </div>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{score ? `${score}/10` : "אין עדיין ניתוח התאמה"}</span>
      {shouldApply === true && <span style={{ fontSize: 12, color: GREEN }}>✓ כדאי להגיש</span>}
      {shouldApply === false && <span style={{ fontSize: 12, color: RUST }}>✗ לא מומלץ להגיש</span>}
    </div>
  );
}

function QaListEditor({ title, help, items, onChange, categoryOptions }) {
  const [draft, setDraft] = useState({ question: "", answer: "", category: categoryOptions?.[0] || "" });
  function add() {
    if (!draft.question.trim()) return;
    onChange([...items, { ...draft, question: draft.question.trim() }]);
    setDraft({ question: "", answer: "", category: categoryOptions?.[0] || "" });
  }
  function remove(index) { onChange(items.filter((_, i) => i !== index)); }
  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{title}</p>
      {help && <p style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>{help}</p>}
      {items.map((item, i) => (
        <div key={i} style={{ ...cardStyle, padding: "10px 14px" }}>
          <div className={styles.toolbar}>
            <button className={styles.button} onClick={() => remove(i)} style={{ fontSize: 12, color: RUST }}>הסרה</button>
            {item.category && <span className={styles.badge}>{item.category}</span>}
          </div>
          <p style={{ fontSize: 14, fontWeight: 500 }}>{item.question}</p>
          {item.answer && <p className={styles.text} style={{ color: MUTED, fontSize: 13 }}>{item.answer}</p>}
        </div>
      ))}
      <div style={{ ...cardStyle, padding: "10px 14px" }}>
        <div className={styles.grid}>
          {categoryOptions && (
            <label className={styles.field}><span>קטגוריה</span>
              <select className="hq-field" style={inputStyle} value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}
          <label className={styles.field}><span>שאלה</span>
            <input className="hq-field" style={inputStyle} value={draft.question} onChange={e => setDraft({ ...draft, question: e.target.value })} />
          </label>
        </div>
        <label className={styles.field}><span>תשובה / הערה (אופציונלי)</span>
          <textarea className="hq-field" style={inputStyle} rows={2} value={draft.answer} onChange={e => setDraft({ ...draft, answer: e.target.value })} />
        </label>
        <button className={styles.button} onClick={add}>הוספה</button>
      </div>
    </div>
  );
}

// מסך פרטי משרה עשיר — תואם למבנה של המוצר הישן (מד התאמה, יתרונות/פערים,
// סיכומי חברה ומוצר, CV+מכתב מותאמים, שאלות הכנה לראיון). כל השדות האלה
// כרגע עריכה ידנית בלבד — אין כאן שום קריאת AI. הם ימולאו אוטומטית ברגע
// שהאינטגרציה תתחבר (Slice הבא), ועד אז אפשר למלא אותם ידנית ממה שכבר קיים
// במוצר הישן.
export default function JobDetail({ job, setData, onBack }) {
  const [tab, setTab] = useState("fit"); // fit | prep
  const [error, setError] = useState("");

  function patch(fields) {
    setError("");
    try {
      setData(prev => saveJob(prev, { ...stripMeta(job), ...fields }, job.id));
    } catch (failure) { setError(failure.message); }
  }
  function stripMeta(j) {
    const { id, createdAt, updatedAt, ...rest } = j;
    return rest;
  }

  const [fitDraft, setFitDraft] = useState({
    fitScore: job.fitScore ?? "", fitSummary: job.fitSummary, companySummary: job.companySummary, productSummary: job.productSummary,
    fitPros: job.fitPros.join("\n"), fitCons: job.fitCons.join("\n"),
  });
  function saveFit() {
    patch({
      fitScore: fitDraft.fitScore === "" ? null : Number(fitDraft.fitScore),
      fitSummary: fitDraft.fitSummary, companySummary: fitDraft.companySummary, productSummary: fitDraft.productSummary,
      fitPros: fitDraft.fitPros.split("\n").map(s => s.trim()).filter(Boolean),
      fitCons: fitDraft.fitCons.split("\n").map(s => s.trim()).filter(Boolean),
      shouldApply: fitDraft.fitScore !== "" ? Number(fitDraft.fitScore) >= 6 : job.shouldApply,
    });
  }

  const [docsDraft, setDocsDraft] = useState({ tailoredCv: job.tailoredCv, coverLetter: job.coverLetter });
  function saveDocs() { patch(docsDraft); }

  return (
    <div>
      <div className={styles.toolbar}>
        <button className={styles.button} onClick={onBack}>← כל המשרות</button>
        <div style={{ textAlign: "right" }}>
          <h3 style={{ margin: 0 }}>{job.role}</h3>
          <p style={{ color: MUTED, margin: 0 }}>{job.company}</p>
        </div>
      </div>

      <div style={cardStyle}>
        <FitMeter score={job.fitScore} shouldApply={job.shouldApply} />
      </div>

      <nav aria-label="הכנה למשרה" className={styles.tabs}>
        <button style={tab === "fit" ? { fontWeight: 600 } : { color: MUTED }} className={styles.button} onClick={() => setTab("fit")}>ניתוח התאמה</button>
        <button style={tab === "prep" ? { fontWeight: 600 } : { color: MUTED }} className={styles.button} onClick={() => setTab("prep")}>הכנה לראיון</button>
      </nav>

      {error && <p role="alert" className={styles.error}>{error}</p>}

      {tab === "fit" ? (
        <div style={{ ...cardStyle, padding: 16 }}>
          <div className={styles.grid}>
            <label className={styles.field}><span>ציון התאמה (1–10)</span>
              <input className="hq-field" style={inputStyle} type="number" min="1" max="10" value={fitDraft.fitScore} onChange={e => setFitDraft({ ...fitDraft, fitScore: e.target.value })} />
            </label>
          </div>
          <label className={styles.field}><span>סיכום התאמה</span>
            <textarea className="hq-field" style={inputStyle} rows={3} value={fitDraft.fitSummary} onChange={e => setFitDraft({ ...fitDraft, fitSummary: e.target.value })} />
          </label>
          <div className={styles.grid}>
            <label className={styles.field}><span>יתרונות (שורה לכל יתרון)</span>
              <textarea className="hq-field" style={inputStyle} rows={4} value={fitDraft.fitPros} onChange={e => setFitDraft({ ...fitDraft, fitPros: e.target.value })} />
            </label>
            <label className={styles.field}><span>פערים (שורה לכל פער)</span>
              <textarea className="hq-field" style={inputStyle} rows={4} value={fitDraft.fitCons} onChange={e => setFitDraft({ ...fitDraft, fitCons: e.target.value })} />
            </label>
          </div>
          <label className={styles.field}><span>על החברה</span>
            <textarea className="hq-field" style={inputStyle} rows={3} value={fitDraft.companySummary} onChange={e => setFitDraft({ ...fitDraft, companySummary: e.target.value })} />
          </label>
          <label className={styles.field}><span>על המוצר</span>
            <textarea className="hq-field" style={inputStyle} rows={3} value={fitDraft.productSummary} onChange={e => setFitDraft({ ...fitDraft, productSummary: e.target.value })} />
          </label>
          <button style={primaryBtn} className={styles.button} onClick={saveFit}>שמירת ניתוח</button>

          <details className={styles.job} style={{ marginTop: 16 }}>
            <summary>▶ תיאור המשרה המקורי</summary>
            <p className={styles.text} style={{ marginTop: 8 }}>{job.description || "לא הוזן תיאור"}</p>
          </details>
        </div>
      ) : (
        <div>
          <div style={{ ...cardStyle, padding: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600 }}>CV ומכתב מקצועי מותאמים</p>
            <p style={{ fontSize: 12, color: MUTED }}>עד שהכנה אוטומטית תתחבר — אפשר להדביק כאן טקסט שהוכן מראש (למשל מהמוצר הישן).</p>
            <label className={styles.field}><span>CV מותאם</span>
              <textarea className="hq-field" style={inputStyle} rows={6} value={docsDraft.tailoredCv} onChange={e => setDocsDraft({ ...docsDraft, tailoredCv: e.target.value })} />
            </label>
            <label className={styles.field}><span>מכתב מקצועי</span>
              <textarea className="hq-field" style={inputStyle} rows={6} value={docsDraft.coverLetter} onChange={e => setDocsDraft({ ...docsDraft, coverLetter: e.target.value })} />
            </label>
            <button style={primaryBtn} className={styles.button} onClick={saveDocs}>שמירה</button>
          </div>

          <QaListEditor
            title="שאלות שצפויות להישאל בראיון"
            help="שאלה + תשובה מוצעת. אפשר למלא ידנית עד שהכנה אוטומטית תתחבר."
            items={job.tailoredQuestions}
            categoryOptions={["HR", "Behavioral", "Product", "Strategy", "Technical"]}
            onChange={list => patch({ tailoredQuestions: list })}
          />
          <QaListEditor
            title="שאלות שכדאי לי לשאול"
            items={job.candidateQuestions}
            onChange={list => patch({ candidateQuestions: list })}
          />
          <QaListEditor
            title="שאלות שאני מכין/ה בעצמי"
            items={job.myQuestions}
            onChange={list => patch({ myQuestions: list })}
          />
        </div>
      )}
    </div>
  );
}
