"use client";
import { useState } from "react";
import { Check, ChevronLeft, Dumbbell } from "lucide-react";
import { todayState, nextSession } from "../today.mjs";
import { buildProgram, SHORT_ALTERNATIVE } from "../program.mjs";
import css from "./health-v2.module.css";

const fmt = value => new Date(value + "T12:00").toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
const loadText = e => (e.load ? e.load + " ק״ג" : e.hint || "לתעד משקל");

function ExerciseList({ exercises }) {
  return <ul className={css.exList}>{exercises.map(e => <li key={e.id}><strong>{e.name}</strong><span>{e.sets} סטים × {e.reps} · {loadText(e)}</span></li>)}</ul>;
}

// מסך "היום": פעולה אחת ברורה — האימון הבא לפי התוכנית. חלופה קצרה אחת רק אם אין זמן.
export function TodayScreen({ d, today, onStart, onLogShort, onOpenJournal }) {
  const [shortOpen, setShortOpen] = useState(false);
  const s = todayState(d, today);
  const recs = s.recommendations.map((text, i) => <p key={i} className={css.recommend}>{text}</p>);
  const week = <div className={css.weekLine}><span>אימונים השבוע</span><strong>{s.weekDone}{s.goal ? " מתוך " + s.goal : ""}</strong></div>;

  if (s.status === "restricted") return <div className={css.stack}>
    <section className={css.actionHero}><p className={css.eyebrow}>{fmt(today)}</p><h2>התוכנית ממתינה לאיש/ת מקצוע</h2><p>סומנה מגבלה או אי־ודאות, ולכן לא מוצג כאן אימון מותאם. אפשר להמשיך לתעד תנועה ואוכל ביומן.</p></section>
    <button className={css.secondary} onClick={onOpenJournal}>לתיעוד ביומן</button>
  </div>;

  const done = s.status === "done";
  return <div className={css.stack}>
    <section className={css.actionHero}>
      <p className={css.eyebrow}>{fmt(today)}</p>
      {done ? <>
        <h2>אימון {s.doneSession} הושלם היום</h2>
        <p>עשית את הצעד להיום. האימון הבא בתור הוא אימון {s.session}.</p>
        <button className={css.heroGhost} onClick={() => onStart(s.session)}>להתחיל את אימון {s.session} בכל זאת</button>
      </> : <>
        <h2>האימון להיום: אימון {s.session}</h2>
        <p>{s.exercises.length} תרגילים · 2 סטים לכל תרגיל</p>
        <ExerciseList exercises={s.exercises} />
        <button className={css.heroCta} onClick={() => onStart(s.session)}>התחלת אימון {s.session}<ChevronLeft size={20} /></button>
      </>}
    </section>
    {!done && <section className={css.card + " " + css.stack}>
      <button className={css.linkButton} aria-expanded={shortOpen} onClick={() => setShortOpen(v => !v)}>אין לי זמן עכשיו</button>
      {shortOpen && <>
        <div><strong>{SHORT_ALTERNATIVE.title}</strong><ul className={css.plainList}>{SHORT_ALTERNATIVE.items.map(i => <li key={i}>{i}</li>)}</ul></div>
        <button className={css.secondary} onClick={onLogShort}>סיימתי, לרשום אימון קצר</button>
      </>}
    </section>}
    <section className={css.card}>{week}</section>
    {recs.length > 0 && <section className={css.card + " " + css.stack}>{recs}</section>}
  </div>;
}

// מסך אימון ראשוני (שקוף לגרסה החיה): רשימת תרגילים, סימון, וסיום שנשמר ביומן.
export function SessionScreen({ id, exercises, onFinish, onCancel }) {
  const [checked, setChecked] = useState({});
  return <div className={css.stack}>
    <section className={css.actionHero}><p className={css.eyebrow}>אימון בתהליך</p><h2>אימון {id}</h2><p>מסמנים כל תרגיל אחרי שסיימת אותו. אם משהו כואב או מרגיש חריג — עוצרים.</p></section>
    <section className={css.card}>
      {exercises.map(e => <label key={e.id} className={css.exRow}>
        <input type="checkbox" checked={!!checked[e.id]} onChange={() => setChecked(c => ({ ...c, [e.id]: !c[e.id] }))} />
        <span><strong>{e.name}</strong><small>{e.sets} סטים × {e.reps} · {loadText(e)}</small></span>
        {checked[e.id] && <Check size={18} />}
      </label>)}
    </section>
    <button className={css.primary + " " + css.wide} onClick={onFinish}>סיום אימון ושמירה</button>
    <button className={css.linkButton} onClick={onCancel}>יציאה בלי לשמור</button>
  </div>;
}

// לשונית "אימון": כל אימוני A/B/C מהתוכנית, האימון הבא מסומן.
export function WorkoutTab({ d, onStart }) {
  const program = buildProgram(d.profile);
  if (program.restricted) return <section className={css.card}><h3>התוכנית ממתינה לאיש/ת מקצוע</h3><p className={css.subtle}>סומנה מגבלה או אי־ודאות. לא מוצגת תוכנית תרגילים מותאמת.</p></section>;
  const next = nextSession(d.workouts, program.ids);
  return <div className={css.stack}>
    <div className={css.sectionHead}><h2>האימונים שלי</h2></div>
    {program.ids.map(id => <section key={id} className={css.card + " " + css.stack}>
      <div className={css.sessionHead}><h3><Dumbbell size={18} /> אימון {id}</h3>{id === next && <span className={css.nextTag}>הבא בתור</span>}</div>
      <ExerciseList exercises={program.sessions[id]} />
      <button className={id === next ? css.primary : css.secondary} onClick={() => onStart(id)}>התחלת אימון {id}</button>
    </section>)}
  </div>;
}
