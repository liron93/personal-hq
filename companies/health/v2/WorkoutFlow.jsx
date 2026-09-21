"use client";
import { useState } from "react";
import { ChevronLeft, Dumbbell, Pencil } from "lucide-react";
import { todayState, nextSession } from "../today.mjs";
import { SHORT_ALTERNATIVE } from "../program.mjs";
import { resolveProgram } from "../plan.mjs";
import css from "./health-v2.module.css";

const fmt = value => new Date(value + "T12:00").toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
const loadText = e => (e.load ? e.load + " ק״ג" : e.hint || "לתעד משקל");

function ExerciseList({ exercises }) {
  return <ul className={css.exList}>{exercises.map(e => <li key={e.id}><strong>{e.name}</strong><span>{e.sets} סטים × <bdi dir="ltr">{e.reps}</bdi> · {loadText(e)}</span></li>)}</ul>;
}

// מסך "היום": פעולה אחת ברורה — האימון הבא לפי התוכנית. חלופה קצרה אחת רק אם אין זמן.
export function TodayScreen({ d, today, onStart, onResume, onLogShort, onOpenJournal, onBuildPlan }) {
  const [shortOpen, setShortOpen] = useState(false);
  const s = todayState(d, today);
  const recs = s.recommendations.map((text, i) => <p key={i} className={css.recommend}>{text}</p>);
  const week = <div className={css.weekLine}><span>אימונים השבוע</span><strong>{s.weekDone}{s.goal ? " מתוך " + s.goal : ""}</strong></div>;

  if (s.status === "empty" && !d.liveWorkout) return <div className={css.stack}>
    <section className={css.actionHero}><p className={css.eyebrow}>{fmt(today)}</p><h2>אין עדיין תוכנית אימונים</h2><p>בנו או ייבאו תוכנית A/B/C, ואז המסך הזה יציג את האימון הבא בלחיצה אחת.</p><button className={css.heroCta} onClick={onBuildPlan}>בניית או ייבוא תוכנית<ChevronLeft size={20} /></button></section>
    <section className={css.card}>{week}</section>
    {recs.length > 0 && <section className={css.card + " " + css.stack}>{recs}</section>}
  </div>;

  if (s.status === "restricted") return <div className={css.stack}>
    <section className={css.actionHero}><p className={css.eyebrow}>{fmt(today)}</p><h2>התוכנית ממתינה לאיש/ת מקצוע</h2><p>סומנה מגבלה או אי־ודאות, ולכן לא מוצג כאן אימון מותאם. אפשר להמשיך לתעד תנועה ואוכל ביומן.</p></section>
    <button className={css.secondary} onClick={onOpenJournal}>לתיעוד פעילות</button>
  </div>;

  const done = s.status === "done";
  const live = d.liveWorkout;
  if (live) return <div className={css.stack}><section className={css.actionHero}><p className={css.eyebrow}>{fmt(today)}</p><h2>אימון {live.session} בתהליך</h2><p>האימון שלך נשמר. אפשר להמשיך בדיוק מאיפה שעצרת.</p><button className={css.heroCta} onClick={onResume}>המשך אימון {live.session}<ChevronLeft size={20} /></button></section></div>;
  return <div className={css.stack}>
    <section className={css.actionHero}>
      <p className={css.eyebrow}>{fmt(today)}</p>
      {done ? <>
        <h2>אימון {s.doneSession} הושלם היום</h2>
        <p>עשית את הצעד להיום. האימון הבא בתור הוא אימון {s.session}.</p>
        <button className={css.heroGhost} onClick={() => onStart(s.session)}>להתחיל את אימון {s.session} בכל זאת</button>
      </> : <>
        <h2>האימון להיום: אימון {s.session}</h2>
        <p>{s.exercises.length} תרגילים</p>
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

// לשונית "אימון": כל אימוני A/B/C מהתוכנית, האימון הבא מסומן.
export function WorkoutTab({ d, onStart, onResume, onEditPlan, onBuildPlan }) {
  const program = resolveProgram(d);
  if (program.restricted) return <section className={css.card}><h3>התוכנית ממתינה לאיש/ת מקצוע</h3><p className={css.subtle}>סומנה מגבלה או אי־ודאות. לא מוצגת תוכנית תרגילים מותאמת.</p></section>;
  if (program.empty) return <div className={css.stack}>
    <div className={css.sectionHead}><h2>האימונים שלי</h2></div>
    <section className={css.card + " " + css.stack}><h3>אין עדיין תוכנית</h3><p className={css.subtle}>בנו תוכנית A/B/C, או הדביקו תוכנית קיימת (תרגילים, סטים, טווח חזרות, משקל התחלה) כדי לטעון אותה כבסיס שאפשר לערוך. לא ממציאים תרגילים או משקלים.</p><button className={css.primary} onClick={onBuildPlan}>בניית או ייבוא תוכנית</button></section>
  </div>;
  const next = nextSession(d.workouts, program.ids);
  return <div className={css.stack}>
    <div className={css.sectionHead}><h2>האימונים שלי</h2><button className={css.linkButton} onClick={onEditPlan}><Pencil size={14} /> עריכת התוכנית</button></div>
    {d.liveWorkout && <section className={css.card + " " + css.stack}><strong>אימון {d.liveWorkout.session} בתהליך</strong><button className={css.primary} onClick={onResume}>המשך אימון</button></section>}
    {program.ids.map(id => <section key={id} className={css.card + " " + css.stack}>
      <div className={css.sessionHead}><h3><Dumbbell size={18} /> אימון {id}</h3>{id === next && <span className={css.nextTag}>הבא בתור</span>}</div>
      <ExerciseList exercises={program.sessions[id]} />
      <button className={id === next ? css.primary : css.secondary} onClick={() => onStart(id)}>התחלת אימון {id}</button>
    </section>)}
  </div>;
}
