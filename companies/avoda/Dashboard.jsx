"use client";
import { MUTED, GREEN, RUST, AMBER, cardStyle } from "@/lib/theme";
import { Sec, Metric } from "@/lib/ui";
import { STATUSES } from "./model";
import { practiceStats } from "./practice-state";
import styles from "./career.module.css";

// לוח מוכנות — סיכום מצב חברת הקריירה: משרות, התקדמות תרגול, מצב קורות חיים.
// אין כאן שום ציון "מוכנות" שמבוסס AI — הכל חישוב פשוט ושקוף מהנתונים עצמם,
// בניגוד למוצר הישן שחישב readiness מהערכות AI. זה יתעדכן כשה-AI יתחבר.
export default function Dashboard({ state, onGoJobs, onGoCv, onGoPractice }) {
  const jobs = state.jobs;
  const active = jobs.filter(job => job.status !== "rejected" && job.status !== "withdrawn");
  const byStatus = Object.keys(STATUSES).reduce((acc, key) => ({ ...acc, [key]: jobs.filter(j => j.status === key).length }), {});
  const { total: totalQuestions, done: doneQuestions, percent } = practiceStats(state.practiced);
  const recent = [...jobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  return (
    <div>
      <div className={styles.metrics}>
        <Metric label="משרות פעילות" value={active.length} />
        <Metric label="הוגשו" value={byStatus.applied} />
        <Metric label="ראיונות" value={byStatus.interview} color={byStatus.interview ? GREEN : undefined} />
        <Metric label="הצעות" value={byStatus.offer} color={byStatus.offer ? GREEN : undefined} />
      </div>

      <Sec title="התקדמות תרגול" />
      <button className={styles.button} onClick={onGoPractice} style={{ ...cardStyle, width: "100%", textAlign: "right", cursor: "pointer", border: "none", display: "block" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: MUTED }}>{doneQuestions} מתוך {totalQuestions} שאלות</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{percent}%</span>
        </div>
        <div style={{ height: 8, background: "#EEF0F3", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${percent}%`, background: percent > 0 ? GREEN : "transparent", borderRadius: 8, transition: "width 200ms ease" }} />
        </div>
      </button>

      <Sec title="קורות חיים" />
      <button className={styles.button} onClick={onGoCv} style={{ ...cardStyle, width: "100%", textAlign: "right", cursor: "pointer", border: "none", display: "block", padding: "14px 16px" }}>
        {state.cv?.text ? (
          <span style={{ fontSize: 14 }}>קובץ פעיל: <strong>{state.cv.filename || "ללא שם"}</strong></span>
        ) : (
          <span style={{ fontSize: 14, color: MUTED }}>לא הועלו קורות חיים עדיין — לחצו כאן להוספה</span>
        )}
      </button>

      <Sec title="עדכונים אחרונים" />
      {recent.length === 0 ? (
        <div className={styles.empty} style={{ cursor: "pointer" }} onClick={onGoJobs}>עוד אין משרות — לחצו כאן כדי להוסיף את הראשונה</div>
      ) : (
        <div>
          {recent.map(job => (
            <button key={job.id} onClick={onGoJobs} className={styles.button} style={{ ...cardStyle, width: "100%", textAlign: "right", cursor: "pointer", border: "none", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px" }}>
              <span style={{ fontSize: 13, color: MUTED }}>{STATUSES[job.status]}</span>
              <span style={{ fontSize: 14 }}>{job.role} · {job.company}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
