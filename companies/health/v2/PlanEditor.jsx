"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { emptyProgram, normalizeProgram, updateExercise, addExercise, removeExercise, moveExercise, addSession, removeSession, cleanLoad } from "../plan.mjs";
import { parseReps, parseWeight, UNSET } from "../program.mjs";
import css from "./health-v2.module.css";

const RESTS = [30, 45, 60, 75, 90, 120, 180];
const badLoadAt = v => v !== null && v !== undefined && String(v).trim() !== "" && parseWeight(v) === null;
const badLoads = e => (e.loads || []).some(badLoadAt);
const badReps = e => parseReps(e.reps) === null;

// עורך תוכנית A/B/C. טיוטה מקומית; נשמר ל-data.program רק בלחיצה על "שמירה".
export default function PlanEditor({ program, onSave, onClose }) {
  const [draft, setDraft] = useState(() => (program.empty ? emptyProgram() : { ...program }));
  const [error, setError] = useState("");
  const ids = ["A", "B", "C"].filter(id => draft.sessions[id]);
  const nowISO = () => new Date().toISOString();
  const edit = fn => { setError(""); setDraft(p => fn(p) || p); };

  const save = () => {
    if (ids.some(id => draft.sessions[id].some(badLoads))) { setError("משקל חייב להיות מספר גדול מ-0 (למשל 12.5), או להישאר ריק (טרם נקבע)."); return; }
    if (ids.some(id => draft.sessions[id].some(badReps))) { setError("לכל תרגיל צריך טווח חזרות תקין: 8-12 או מספר בודד כמו 12."); return; }
    if (ids.some(id => draft.sessions[id].some(e => !e.name.trim()))) { setError("לכל תרגיל צריך שם."); return; }
    const clean = normalizeProgram({ ...draft, source: "custom", updatedAt: nowISO() });
    if (!clean) { setError("התוכנית ריקה."); return; }
    onSave(clean);
  };

  return <div className={css.stack}>
    <div className={css.sectionHead}><h2>עריכת התוכנית</h2><button className={css.linkButton} onClick={onClose}>ביטול</button></div>
    <p className={css.subtle}>{ids.length === 0 ? "התוכנית ריקה. מוסיפים אימון ואז תרגילים. משקל שלא מזינים נשאר ריק." : "אפשר לשנות שמות, סטים, חזרות, משקל ומנוחה. הכול נשמר רק בלחיצה על שמירה."}</p>
    {ids.map(sid => <section key={sid} className={css.card + " " + css.stack}>
      <div className={css.sessionHead}><h3>אימון {sid}</h3>{ids.length > 1 && sid === ids[ids.length - 1] && <button className={css.status + " " + css.skipped} onClick={() => edit(p => removeSession(p, sid))}>הסרת אימון</button>}</div>
      {draft.sessions[sid].map((e, i, list) => <div key={e.id} className={css.editEx}>
        <label>שם התרגיל<input className={css.field} value={e.name} onChange={ev => edit(p => updateExercise(p, sid, e.id, { name: ev.target.value }))} /></label>
        <div className={css.editGrid}>
          <label>סטים<select className={css.field} value={e.sets} onChange={ev => edit(p => updateExercise(p, sid, e.id, { sets: Number(ev.target.value) }))}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          <label>חזרות (8-12 או 12)<input className={css.field} dir="ltr" inputMode="text" value={e.reps} aria-invalid={e.reps !== "" && badReps(e)} onChange={ev => edit(p => updateExercise(p, sid, e.id, { reps: ev.target.value }))} /></label>
          <label>מנוחה<select className={css.field} value={e.rest} onChange={ev => edit(p => updateExercise(p, sid, e.id, { rest: Number(ev.target.value) }))}>{[...new Set([...RESTS, e.rest])].sort((a, b) => a - b).map(s => <option key={s} value={s}>{s} שנ׳</option>)}</select></label>
        </div>
        <div className={css.stack}><span className={css.loadTitle}>משקל לכל סט (ק״ג). ריק = {UNSET}</span>
          <div className={css.loadGrid}>{Array.from({ length: e.sets }, (_, si) => <label key={si}>סט {si + 1}<input className={css.field} inputMode="decimal" value={e.loads?.[si] ?? ""} placeholder={UNSET} aria-invalid={badLoadAt(e.loads?.[si])} onChange={ev => edit(p => updateExercise(p, sid, e.id, { loads: Array.from({ length: e.sets }, (_, k) => (k === si ? ev.target.value : e.loads?.[k] ?? null)) }))} /></label>)}</div>
        </div>
        <div className={css.rowBtns}>
          <button className={css.iconButton} aria-label="הזזה למעלה" disabled={i === 0} onClick={() => edit(p => moveExercise(p, sid, e.id, -1))}><ArrowUp size={18} /></button>
          <button className={css.iconButton} aria-label="הזזה למטה" disabled={i === list.length - 1} onClick={() => edit(p => moveExercise(p, sid, e.id, 1))}><ArrowDown size={18} /></button>
          <button className={css.iconButton} aria-label="הסרת תרגיל" disabled={list.length <= 1} onClick={() => edit(p => removeExercise(p, sid, e.id))}><Trash2 size={18} /></button>
        </div>
      </div>)}
      <button className={css.secondary} onClick={() => edit(p => addExercise(p, sid, ""))}>הוספת תרגיל</button>
    </section>)}
    {ids.length < 3 && <button className={css.secondary} onClick={() => edit(p => addSession(p))}>הוספת אימון {["A", "B", "C"].find(x => !draft.sessions[x])}</button>}
    {error && <p className={css.validation} role="alert">{error}</p>}
    <button className={css.primary + " " + css.wide} onClick={save}>שמירת התוכנית</button>
  </div>;
}
