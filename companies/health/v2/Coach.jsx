"use client";
// "המאמן שלי" (Issue #7, P0): עובדות מחושבות בלבד מתוך האימונים שתועדו/יובאו - בלי
// "פידבק"/ניסוח מקצועי (חוזקות/תשומת לב/מטרת שבוע - תחום גל, ראה הבהרת הבעלות ב-Issue #7).
// כל מספר כאן נגזר מ-companies/health/coach.mjs (פונקציות טהורות) - אין המצאת נתון כש-
// חסר מידע, בדיוק כמו goals.mjs/history.mjs הקיימים.
import { useMemo } from "react";
import { workoutWindowSummary, sessionSplit, muscleGroupVolume, untrainedGroups, weeklyBrief } from "../coach.mjs";
import { goalTarget, forecast } from "../goals.mjs";
import css from "./health-v2.module.css";

const SESSION_IDS = ["A", "B", "C"];
const shortDate = iso => new Date(iso + "T12:00").toLocaleDateString("he-IL", { day: "numeric", month: "short" });

/** שורה מקוצרת ליעד משקל - פירוט מלא (גרף/ממוצע נע) נמצא בטאב "התקדמות"; כאן רק תקציר
    עם קישור, לפי דרישת גל ש"מטרת השבוע" (יעד המשקל) תוצג גם מחוץ לפרופיל/התקדמות. */
export function weightGoalLine(d, today) {
  const tgt = goalTarget(d);
  if (tgt === null) return "לא הוגדר יעד משקל.";
  const fc = forecast(d.weighIns || [], tgt, today);
  if (fc.status === "insufficient") return `יעד משקל: ${tgt} ק״ג · אין עדיין מספיק שקילות לתחזית.`;
  if (fc.status === "reached") return `יעד משקל: ${tgt} ק״ג · קרוב מאוד ליעד.`;
  if (fc.status === "range") return `יעד משקל: ${tgt} ק״ג · תחזית הגעה: ${fc.openEnded ? `מ-${shortDate(fc.from)}` : `${shortDate(fc.from)} – ${shortDate(fc.to)}`}.`;
  return `יעד משקל: ${tgt} ק״ג · אין תחזית ברורה כרגע.`;
}

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

/**
 * בריף בראש המסך (כלל גל, שלב 2): "מה עושים עכשיו" קודם לכל פירוט - השבוע מול היעד,
 * עד 3 תובנות עם מקור/חלון, פעולה אחת, ו-CTA כש-אין מספיק מידע. אין שום ניסוח "חכם" -
 * כל טקסט מגיע ישירות מ-weeklyBrief (חישוב דטרמיניסטי, לא LLM).
 */
function Brief({ brief, weightLine }) {
  const safety = brief.action?.kind === "safety";
  return (
    <section className={css.card + " " + css.stack}>
      <p className={css.eyebrow}>מה עושים עכשיו</p>
      <p className={css.subtle}>
        השבוע: {brief.week.count} אימונים{brief.week.goal != null ? ` מתוך יעד ${brief.week.goal}` : ""}
      </p>
      <p className={css.subtle}>{weightLine}</p>

      {brief.cta && <p className={css.subtle}>{brief.cta.text}</p>}

      {brief.insights.length > 0 && (
        <div className={css.weekRows}>
          {brief.insights.map((ins, i) => (
            <div key={i}><span>{ins.source} · {ins.window}</span><strong>{ins.text}</strong></div>
          ))}
        </div>
      )}

      {brief.action && (
        <div className={safety ? css.recommend : undefined} style={!safety ? { fontWeight: 700 } : undefined}>
          {brief.action.text}
        </div>
      )}

      <p className={css.disclaimer}>חישוב דטרמיניסטי מתוך האימונים שתועדו/יובאו בלבד - לא אבחון או טיפול רפואי, וכל הצעה דורשת אישור לפני שינוי בתוכנית. כאב או תחושת פציעה - פנו לאיש מקצוע.</p>
    </section>
  );
}

export default function Coach({ d, today }) {
  const workouts = d.workouts || [];
  const weeklyGoal = Number(d.profile?.baseline?.weeklyWorkoutGoal) || null;
  const brief = useMemo(() => weeklyBrief(d, today), [d, today]);
  const s28 = useMemo(() => workoutWindowSummary(workouts, 28, today, { weeklyGoal }), [workouts, today, weeklyGoal]);
  const sessions7 = useMemo(() => sessionSplit(workouts, 7, today), [workouts, today]);
  const sessions28 = useMemo(() => sessionSplit(workouts, 28, today), [workouts, today]);
  const muscle7 = useMemo(() => muscleGroupVolume(workouts, 7, today), [workouts, today]);
  const muscle28 = useMemo(() => muscleGroupVolume(workouts, 28, today), [workouts, today]);
  const weightLine = useMemo(() => weightGoalLine(d, today), [d, today]);

  return (
    <div className={css.stack}>
      <div className={css.sectionHead}><h2>המאמן שלי</h2></div>

      <Brief brief={brief} weightLine={weightLine} />

      <p className={css.eyebrow}>פירוט</p>
      <WindowCard title="7 הימים האחרונים" summary={brief.week} sessions={sessions7} />
      <MuscleCoverage days={7} groups={muscle7.groups} unmapped={muscle7.unmapped} />

      <WindowCard title="28 הימים האחרונים" summary={s28} sessions={sessions28} />
      <MuscleCoverage days={28} groups={muscle28.groups} unmapped={muscle28.unmapped} />

      <section className={css.card + " " + css.stack}>
        <h3>משקל גוף ותחזית</h3>
        <p className={css.subtle}>הגרף, הממוצע הנע והתחזית המלאה להגעה ליעד נמצאים בלשונית "התקדמות".</p>
      </section>
    </div>
  );
}
