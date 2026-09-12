"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { MUTED, RUST, tabBtn } from "@/lib/theme";
import { Metric } from "@/lib/ui";
import { INIT, STORE_KEY, summarize, validateState } from "./model";
import Dashboard from "./Dashboard";
import Jobs from "./Jobs";
import CV from "./CV";
import Practice from "./Practice";
import styles from "./career.module.css";

const TABS = [
  ["dashboard", "דשבורד"],
  ["jobs", "משרות"],
  ["cv", "קורות חיים"],
  ["practice", "תרגול"],
];

export function CareerView({ store }) {
  const { data, setData, ready, status, error, reload, sync, syncError, retrySync } = store;
  const [tab, setTab] = useState("dashboard");
  const validated = useMemo(() => {
    if (!data) return { state: INIT, error: "" };
    try { return { state: validateState(data), error: "" }; }
    catch { return { state: INIT, error: "נתוני הקריירה אינם בפורמט נתמך. לא נשנה אותם; יש לבדוק את הנתונים לפני המשך העבודה" }; }
  }, [data]);
  const state = validated.state;
  const summary = summarize(state);

  if (!ready || validated.error) return <section aria-live="polite">
    <p role={error || validated.error ? "alert" : "status"}>{validated.error || error || "טוען את חברת הקריירה שלך…"}</p>
    {error && <button onClick={reload}>ניסיון נוסף</button>}
  </section>;

  return <div className={styles.root} dir="rtl">
    <p style={{ color: MUTED }}>מקום אחד למשרות, ניתוח התאמה, קורות חיים ותרגול ראיונות.</p>
    <div className={styles.metrics}>
      <Metric label="מועמדויות פעילות" value={summary.activeJobs} />
      <Metric label="ראיונות" value={summary.interviews} />
      <Metric label="צעדים באיחור" value={summary.overdue} color={summary.overdue ? RUST : undefined} />
    </div>
    {summary.nextStep && <p className={styles.next}>הצעד הבא: {summary.nextStep.text} · {summary.nextStep.company}{summary.nextStep.date ? ` · ${summary.nextStep.date}` : " · ללא מועד"}</p>}

    <nav aria-label="מחלקות הקריירה" className={styles.tabs}>
      {TABS.map(([key, label]) => (
        <button key={key} style={tabBtn(tab === key)} onClick={() => setTab(key)}>{label}</button>
      ))}
    </nav>

    <div aria-live="polite" role="status" className={styles.status}>
      {sync === "syncing" ? "שומר…"
        : sync === "synced" ? "נשמר במכשיר ומסונכרן לענן"
        : sync === "local" ? "נשמר במכשיר זה בלבד. יסתנכרן לענן עם התחברות"
        : sync === "sync-error" ? "נשמר במכשיר זה, אך הסנכרון לענן נכשל"
        : "השינויים נשמרים אוטומטית במכשיר זה"}
    </div>
    {sync === "sync-error" && <p role="alert" className={styles.error}>
      {syncError || "הסנכרון לענן נכשל. הנתונים בטוחים במכשיר הזה."} <button className={styles.button} onClick={retrySync}>נסה שוב</button>
    </p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}

    {tab === "dashboard" && <Dashboard state={state} onGoJobs={() => setTab("jobs")} onGoCv={() => setTab("cv")} onGoPractice={() => setTab("practice")} />}
    {tab === "jobs" && <Jobs state={state} setData={setData} />}
    {tab === "cv" && <CV state={state} setData={setData} />}
    {tab === "practice" && <Practice state={state} setData={setData} />}
  </div>;
}

export default function Company() {
  const store = useStore(STORE_KEY, INIT);
  return <CareerView store={store} />;
}
