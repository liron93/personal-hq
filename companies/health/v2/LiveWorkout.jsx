"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import * as L from "../live.mjs";
import css from "./health-v2.module.css";

const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const planLine = e => <>{e.plan.sets} סטים × <bdi dir="ltr">{e.plan.reps}</bdi>{e.plan.load ? ` · ${e.plan.load} ק״ג` : e.plan.hint ? ` · ${e.plan.hint}` : ""}</>;

function RestBar({ live, now, onAdd, onSkip }) {
  const left = L.restRemaining(live, now);
  if (!live.restEndsAt) return null;
  if (left <= 0) return <section className={css.restBar + " " + css.restDone} role="status"><strong>המנוחה נגמרה. אפשר להמשיך לסט הבא.</strong><button className={css.status} onClick={onSkip}>סגירה</button></section>;
  const pct = live.restTotal ? Math.round((left / live.restTotal) * 100) : 0;
  return <section className={css.restBar} role="timer" aria-live="off">
    <div className={css.restTop}><span>מנוחה</span><strong dir="ltr">{mmss(left)}</strong></div>
    <div className={css.restTrack}><i style={{ width: pct + "%" }} /></div>
    <div className={css.restActions}><button className={css.status} onClick={onAdd}>עוד 15 שניות</button><button className={css.status} onClick={onSkip}>דלג על המנוחה</button></div>
  </section>;
}

export default function LiveWorkout({ initial, onCommit, onFinish, onCancel, onLeave, today }) {
  const [live, setLive] = useState(initial);
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState("work"); // work | summary
  const [replacing, setReplacing] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const liveRef = useRef(initial);
  const closed = useRef(false);
  const first = useRef(true);

  const apply = fn => setLive(l => { const n = fn(l); liveRef.current = n; return n; });

  // שמירה מושהית לחנות (כדי לא לכתוב לענן בכל הקלדה), ושטיפה בעזיבת המסך.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => { if (!closed.current) onCommit(live); }, 500);
    return () => clearTimeout(t);
  }, [live]); // eslint-disable-line
  useEffect(() => () => { if (!closed.current) onCommit(liveRef.current); }, []); // eslint-disable-line

  useEffect(() => {
    if (!live.restEndsAt) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live.restEndsAt]);

  const e = live.exercises[idx];
  const total = live.exercises.length;
  const sum = L.summary(live);

  const finish = () => {
    if (sum.doneSets === 0 && !confirmEmpty) { setConfirmEmpty(true); return; }
    closed.current = true;
    onFinish(L.finishLive(liveRef.current, { now: Date.now(), today }));
  };
  const cancel = () => { if (!confirmCancel) { setConfirmCancel(true); return; } closed.current = true; onCancel(); };

  if (view === "summary") return <div className={css.stack}>
    <section className={css.actionHero}><p className={css.eyebrow}>סיכום אימון {live.session}</p><h2>{sum.doneSets} סטים בוצעו</h2><p>{sum.doneExercises} מתוך {sum.exercises} תרגילים{sum.skipped ? " · דולגו " + sum.skipped : ""}</p></section>
    <section className={css.card}>
      {live.exercises.map((x, i) => <button key={x.exId} className={css.sumRow} onClick={() => { setIdx(i); setView("work"); }}>
        <span><strong>{x.name}</strong><small>{x.status === "skipped" ? "דולג" : `${x.sets.filter(s => s.done).length} מתוך ${x.sets.length} סטים`}{x.effort ? " · " + L.EFFORTS[x.effort] : ""}</small></span>
        <ChevronLeft size={18} />
      </button>)}
    </section>
    {confirmEmpty && <p className={css.validation} role="alert">לא סומן אף סט כבוצע. לשמור בכל זאת?</p>}
    <button className={css.primary + " " + css.wide} onClick={finish}>{confirmEmpty ? "כן, לשמור אימון" : "סיום ושמירה"}</button>
    <button className={css.secondary} onClick={() => { setConfirmEmpty(false); setView("work"); }}>חזרה לאימון</button>
    <button className={css.linkButton} onClick={cancel}>{confirmCancel ? "לחיצה נוספת לביטול האימון בלי לשמור" : "ביטול האימון"}</button>
  </div>;

  return <div className={css.stack}>
    <div className={css.liveHead}>
      <button className={css.linkButton} onClick={() => { closed.current = true; onCommit(liveRef.current); onLeave(); }}>יציאה (האימון נשמר)</button>
      <span className={css.eyebrow}>אימון {live.session} · תרגיל {idx + 1} מתוך {total}</span>
    </div>
    <div className={css.progressLine}>{live.exercises.map((x, i) => <i key={x.exId} className={i === idx ? css.done : x.status === "skipped" ? css.skippedDot : x.sets.every(s => s.done) ? css.done : ""} />)}</div>
    <RestBar live={live} now={now} onAdd={() => apply(l => L.addRest(l, 15, Date.now()))} onSkip={() => apply(L.clearRest)} />

    <section className={css.card + " " + css.stack}>
      <div>
        <h2 className={css.liveTitle}>{e.name}</h2>
        <p className={css.subtle}>מתוכנן: {planLine(e)}</p>
        {e.replacedFrom && <p className={css.subtle}>הוחלף במקום: {e.replacedFrom}</p>}
        {e.last && <p className={css.subtle}>בפעם הקודמת ({e.last.date}): {e.last.sets.map(s => `${s.weight ?? "?"} ק״ג × ${s.reps ?? "?"}`).join(" · ")}</p>}
      </div>

      {e.status === "skipped" ? <div className={css.stack}><p>התרגיל דולג.</p><button className={css.secondary} onClick={() => apply(l => L.skipExercise(l, idx))}>ביטול הדילוג</button></div> : <>
        <div className={css.setGrid} role="group" aria-label="סטים">
          <span /><small>משקל (ק״ג)</small><small>חזרות</small><span />
          {e.sets.map((s, si) => <div className={css.setRow} key={si}>
            <span className={css.setNum}>{si + 1}</span>
            <input className={css.field} inputMode="decimal" aria-label={`משקל בסט ${si + 1}`} value={s.weight} onChange={ev => apply(l => L.setSetField(l, idx, si, "weight", ev.target.value))} placeholder="—" />
            <input className={css.field} inputMode="numeric" aria-label={`חזרות בסט ${si + 1}`} value={s.reps} onChange={ev => apply(l => L.setSetField(l, idx, si, "reps", ev.target.value))} placeholder={e.plan.reps} dir="ltr" />
            <button className={css.doneBtn + " " + (s.done ? css.doneOn : "")} aria-pressed={s.done} aria-label={`סט ${si + 1} בוצע`} onClick={() => apply(l => L.toggleSetDone(l, idx, si, Date.now()))}><Check size={20} /></button>
          </div>)}
        </div>
        <div className={css.rowBtns}>
          <button className={css.secondary} onClick={() => apply(l => L.addSet(l, idx))}>הוספת סט</button>
          {e.sets.length > 1 && <button className={css.secondary} onClick={() => apply(l => L.removeSet(l, idx, e.sets.length - 1))}>הסרת סט אחרון</button>}
        </div>

        <div><p className={css.eyebrow}>איך זה הרגיש?</p>
          <div className={css.effortRow}>{Object.entries(L.EFFORTS).map(([k, label]) => <button key={k} aria-pressed={e.effort === k} className={css.effort + " " + (e.effort === k ? css.selected : "")} onClick={() => apply(l => L.setEffort(l, idx, k))}>{label}</button>)}</div>
        </div>
        <label>הערה, אם צריך<textarea className={css.field} rows={2} value={e.note} onChange={ev => apply(l => L.setNote(l, idx, ev.target.value))} /></label>

        <div className={css.rowBtns}>
          <button className={css.secondary} onClick={() => apply(l => L.skipExercise(l, idx))}>דילוג על התרגיל</button>
          <button className={css.secondary} onClick={() => setReplacing(replacing === null ? "" : null)}>החלפת תרגיל</button>
        </div>
        {replacing !== null && <div className={css.replaceBox}>
          <label>איזה תרגיל במקום?<input className={css.field} autoFocus value={replacing} onChange={ev => setReplacing(ev.target.value)} placeholder="למשל לחיצת חזה עם משקולות" /></label>
          <button className={css.primary} disabled={!replacing.trim()} onClick={() => { apply(l => L.replaceExercise(l, idx, replacing)); setReplacing(null); }}>החלפה</button>
        </div>}
      </>}
    </section>

    <div className={css.rowBtns}>
      <button className={css.secondary} disabled={idx === 0} onClick={() => { setReplacing(null); setIdx(idx - 1); }}><ChevronRight size={18} /> הקודם</button>
      {idx < total - 1
        ? <button className={css.primary} onClick={() => { setReplacing(null); setIdx(idx + 1); }}>התרגיל הבא <ChevronLeft size={18} /></button>
        : <button className={css.primary} onClick={() => setView("summary")}>לסיכום וסיום <ChevronLeft size={18} /></button>}
    </div>
    <button className={css.linkButton} onClick={() => setView("summary")}>סיכום וסיום מוקדם</button>
  </div>;
}
