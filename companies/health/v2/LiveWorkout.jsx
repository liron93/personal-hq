"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import * as L from "../live.mjs";
import { formatLoads, UNSET } from "../program.mjs";
import css from "./health-v2.module.css";

const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const planLine = e => <>{e.plan.sets} סטים × <bdi dir="ltr">{e.plan.reps || "—"}</bdi> · משקל: {formatLoads(e.plan.loads)}</>;
const lastLine = last => last.sets.map(s => (s.weight === null ? "משקל לא הוזן" : s.weight + " ק״ג") + " × " + (s.reps ?? "?")).join(" · ");

function SetRows({ e, ei, apply }) {
  return <div className={css.setGrid} role="group" aria-label="סטים">
    <span /><small>משקל (ק״ג)</small><small>חזרות</small><span />
    {e.sets.map((s, si) => <div className={css.setRow} key={si}>
      <span className={css.setNum}>{si + 1}</span>
      <input className={css.field} inputMode="decimal" aria-label={`משקל בסט ${si + 1}`} value={s.weight} onChange={ev => apply(l => L.setSetField(l, ei, si, "weight", ev.target.value))} placeholder={UNSET} />
      <input className={css.field} inputMode="numeric" aria-label={`חזרות בסט ${si + 1}`} value={s.reps} onChange={ev => apply(l => L.setSetField(l, ei, si, "reps", ev.target.value))} placeholder={e.plan.reps} dir="ltr" />
      <button className={css.doneBtn + " " + (s.done ? css.doneOn : "")} aria-pressed={s.done} aria-label={`סט ${si + 1} בוצע`} onClick={() => apply(l => L.toggleSetDone(l, ei, si, Date.now()))}><Check size={20} /></button>
    </div>)}
  </div>;
}

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

export default function LiveWorkout({ initial, onCommit, onFinish, onLeave, today, exitReq, onRequestExit, onDismissExit, onUpdatePlan }) {
  const [planUpdated, setPlanUpdated] = useState({});
  const [live, setLive] = useState(initial);
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState("work"); // work | summary
  const [replacing, setReplacing] = useState(null);
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
  const leave = (tab, keep) => { closed.current = true; if (keep) onCommit(liveRef.current); onLeave(tab, keep); };
  const resolve = choice => {
    const r = L.resolveExit(liveRef.current, choice);
    const tab = exitReq?.tab || "today";
    if (r.action === "summary") { setView("summary"); onDismissExit(); return; }
    if (r.action === "stay") { onDismissExit(); return; }
    leave(tab, r.keep);
  };
  // יציאה שביקשו מבחוץ (ניווט או חזרה בדפדפן): אימון ריק נזרק בשקט, אחרת מציגים אישור.
  useEffect(() => { if (exitReq && !L.needsExitConfirm(liveRef.current)) leave(exitReq.tab, false); }, [exitReq]); // eslint-disable-line
  // כפתור חזרה בדפדפן: לא יוצאים בשקט, מבקשים אישור.
  useEffect(() => {
    const url = window.location.pathname + window.location.search;
    if (window.location.hash === "#live") window.history.replaceState(window.history.state, "", url); // אחרי רענון
    window.history.pushState(window.history.state, "", url + "#live");
    const onPop = ev => { if (closed.current) return; ev.stopImmediatePropagation(); window.history.pushState(window.history.state, "", url + "#live"); onRequestExit("today"); };
    window.addEventListener("popstate", onPop, true);
    return () => { window.removeEventListener("popstate", onPop, true); if (window.location.hash === "#live") window.history.back(); };
  }, []); // eslint-disable-line

  const dialog = exitReq && L.needsExitConfirm(live) ? <div className={css.modalBack} role="presentation"><div className={css.modal} role="alertdialog" aria-modal="true" aria-labelledby="exit-title"><h3 id="exit-title">לצאת מהאימון?</h3><p className={css.subtle}>מה שסימנת עד עכשיו נשמר. אפשר להמשיך בהמשך מאותה נקודה.</p><button className={css.primary} autoFocus onClick={() => resolve("stay")}>המשך אימון</button><button className={css.secondary} onClick={() => resolve("finish")}>סיום ושמירה ביומן</button><button className={css.secondary} onClick={() => resolve("leave")}>יציאה, לשמור להמשך</button><button className={css.linkButton} onClick={() => resolve("cancel")}>ביטול האימון בלי לשמור</button></div></div> : null;

  if (view === "summary") return <div className={css.stack}>{dialog}
    <section className={css.actionHero}><p className={css.eyebrow}>עדכון ביצוע · אימון {live.session}</p><h2>{sum.doneSets} סטים בוצעו</h2><p>בדקו את מה שבוצע בפועל, תקנו משקל או חזרות אם צריך, ורק אז שמרו. סט שלא סומן כבוצע לא יישמר. התוכנית לא משתנה בעצמה.</p></section>
    {live.exercises.map((x, i) => {
      const proposal = L.planUpdateFor(live, i);
      return <section key={x.exId} className={css.card + " " + css.stack}>
        <div className={css.sessionHead}><h3>{x.name}</h3>{x.status === "skipped" && <span className={css.nextTag}>דולג</span>}</div>
        {x.status === "skipped" ? <button className={css.secondary} onClick={() => apply(l => L.skipExercise(l, i))}>ביטול הדילוג</button> : <>
          <p className={css.subtle}>מתוכנן: {planLine(x)}{x.effort ? " · הרגשה: " + L.EFFORTS[x.effort] : ""}</p>
          <SetRows e={x} ei={i} apply={apply} />
          {planUpdated[x.exId] ? <p className={css.subtle}>התוכנית עודכנה: {formatLoads(planUpdated[x.exId])}</p>
            : proposal && <button className={css.secondary} onClick={() => { onUpdatePlan(live.session, x.exId, proposal); setPlanUpdated(p => ({ ...p, [x.exId]: proposal })); }}>עדכן את התוכנית למשקל שבוצע ({formatLoads(proposal)})</button>}
        </>}
      </section>;
    })}
    {confirmEmpty && <p className={css.validation} role="alert">לא סומן אף סט כבוצע. לשמור בכל זאת?</p>}
    <button className={css.primary + " " + css.wide} onClick={finish}>{confirmEmpty ? "כן, לשמור אימון" : "אישור ושמירה ביומן"}</button>
    <button className={css.secondary} onClick={() => { setConfirmEmpty(false); setView("work"); }}>חזרה לאימון</button>
    <button className={css.linkButton} onClick={() => onRequestExit("today")}>יציאה מהאימון</button>
  </div>;

  return <div className={css.stack}>{dialog}
    <div className={css.liveHead}>
      <button className={css.linkButton} onClick={() => onRequestExit("today")}>יציאה מהאימון</button>
      <span className={css.eyebrow}>אימון {live.session} · תרגיל {idx + 1} מתוך {total}</span>
    </div>
    <div className={css.progressLine}>{live.exercises.map((x, i) => <i key={x.exId} className={i === idx ? css.done : x.status === "skipped" ? css.skippedDot : x.sets.every(s => s.done) ? css.done : ""} />)}</div>
    <RestBar live={live} now={now} onAdd={() => apply(l => L.addRest(l, 15, Date.now()))} onSkip={() => apply(L.clearRest)} />

    <section className={css.card + " " + css.stack}>
      <div>
        <h2 className={css.liveTitle}>{e.name}</h2>
        <p className={css.subtle}>מתוכנן: {planLine(e)}</p>
        {e.replacedFrom && <p className={css.subtle}>הוחלף במקום: {e.replacedFrom}</p>}
        {e.last && <p className={css.subtle}>בפעם הקודמת ({e.last.date}): {lastLine(e.last)}</p>}
      </div>

      {e.status === "skipped" ? <div className={css.stack}><p>התרגיל דולג.</p><button className={css.secondary} onClick={() => apply(l => L.skipExercise(l, idx))}>ביטול הדילוג</button></div> : <>
        <SetRows e={e} ei={idx} apply={apply} />
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
