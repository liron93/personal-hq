"use client";
// "המאמן שלי" (Issue #7, P0): עובדות מחושבות בלבד מתוך האימונים שתועדו/יובאו - בלי
// "פידבק"/ניסוח מקצועי (חוזקות/תשומת לב/מטרת שבוע - תחום גל, ראה הבהרת הבעלות ב-Issue #7).
// כל מספר כאן נגזר מ-companies/health/coach.mjs (פונקציות טהורות) - אין המצאת נתון כש-
// חסר מידע, בדיוק כמו goals.mjs/history.mjs הקיימים.
import { useMemo } from "react";
import { workoutWindowSummary, sessionSplit, muscleGroupVolume, untrainedGroups } from "../coach.mjs";
import css from "./health-v2.module.css";

const SESSION_IDS = ["A", "B", "C"];

function WindowCard({ title, summary, sessions }) {
  return (
    <section className={css.card + " " + css.stack}>
      <div className={css.sessionHead}><h3>{title}</h3></div>
      <p className={css.subtle}>
        {summary.count} אימונים{summary.goal != null ? ` מתוך יעד ${summary.goal}` : " (אין יעד שבועי מוגדר)"}
        {summary.daysSinceLast == null ? " · אין עדיין אימון מתועד" : summary.daysSinceLast === 0 ? " · האימון האחרון היה היום" : ` · האימון האחרון לפני ${summary.daysSinceLast} ימים`}
      </p>
      <div className={css.weekRows}>
        {SESSION_IDS.map(id => <div key={id}><span>אימון {id}</span><strong>{sessions.counts[id]}</strong></div>)}
        <div><span>לא מסווג (כולל ייבוא Hevy)</span><strong>{sessions.unclassified}</strong></div>
      </div>
    </section>
  );
}

function MuscleCoverage({ days, groups, unmapped }) {
  const missing = untrainedGroups(groups);
  const anyData = groups.some(g => g.sets > 0);
  return (
    <section className={css.card + " " + css.stack}>
      <h3>כיסוי קבוצות שריר - {days} הימים האחרונים</h3>
      {!anyData ? (
        <p className={css.subtle}>אין עדיין נתון בחלון הזה.</p>
      ) : (
        <div className={css.weekRows}>
          {groups.map(g => (
            <div key={g.group}>
              <span>{g.group}</span>
              <strong>{g.sets === 0 ? "לא תועדה" : `${g.sets} סטים${g.volume > 0 ? ` · ${Math.round(g.volume).toLocaleString("he-IL")} ק״ג×חזרות` : ""}`}</strong>
            </div>
          ))}
        </div>
      )}
      {missing.length > 0 && <p className={css.subtle}>לא תועדו בחלון הזה: {missing.join(", ")}.</p>}
      {unmapped.length > 0 && (
        <p className={css.subtle}>
          {unmapped.length} שמות תרגיל לא ממופים לקבוצת שריר, ולכן לא נספרים למעלה: {unmapped.map(u => u.name).join(", ")}.
        </p>
      )}
      <p className={css.disclaimer}>מקור: אימונים שתועדו/יובאו ב-{days} הימים האחרונים בלבד. עובדות, לא המלצה.</p>
    </section>
  );
}

export default function Coach({ d, today }) {
  const workouts = d.workouts || [];
  const weeklyGoal = Number(d.profile?.baseline?.weeklyWorkoutGoal) || null;
  const s7 = useMemo(() => workoutWindowSummary(workouts, 7, today, { weeklyGoal }), [workouts, today, weeklyGoal]);
  const s28 = useMemo(() => workoutWindowSummary(workouts, 28, today, { weeklyGoal }), [workouts, today, weeklyGoal]);
  const sessions7 = useMemo(() => sessionSplit(workouts, 7, today), [workouts, today]);
  const sessions28 = useMemo(() => sessionSplit(workouts, 28, today), [workouts, today]);
  const muscle7 = useMemo(() => muscleGroupVolume(workouts, 7, today), [workouts, today]);
  const muscle28 = useMemo(() => muscleGroupVolume(workouts, 28, today), [workouts, today]);

  return (
    <div className={css.stack}>
      <div className={css.sectionHead}><h2>המאמן שלי</h2></div>
      <p className={css.subtle}>ניתוח עובדתי של האימונים שתועדו או יובאו - בלי אבחון או ייעוץ רפואי. כשאין מספיק מידע, כתוב "אין נתון" ולא מספר מומצא.</p>

      <WindowCard title="7 הימים האחרונים" summary={s7} sessions={sessions7} />
      <MuscleCoverage days={7} groups={muscle7.groups} unmapped={muscle7.unmapped} />

      <WindowCard title="28 הימים האחרונים" summary={s28} sessions={sessions28} />
      <MuscleCoverage days={28} groups={muscle28.groups} unmapped={muscle28.unmapped} />

      <section className={css.card + " " + css.stack}>
        <h3>משקל גוף ותחזית</h3>
        <p className={css.subtle}>הגרף, הממוצע הנע והתחזית להגעה ליעד נמצאים בלשונית "התקדמות".</p>
      </section>

      <section className={css.card + " " + css.stack}>
        <p className={css.eyebrow}>פידבק שבועי</p>
        <p className={css.subtle}>חוזקות, נקודות לתשומת לב ומטרת שבוע עדיין לא מופיעים כאן - אלה כללים מקצועיים שנמצאים בבנייה בנפרד. בינתיים, כל העובדות שחושבו למעלה פתוחות לעיון ישיר.</p>
      </section>

      <p className={css.disclaimer}>כלי מידע בלבד, לא אבחון או טיפול רפואי. כאב או תחושת פציעה - פנו לאיש מקצוע.</p>
    </div>
  );
}
