"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { cardStyle, inputStyle, primaryBtn, MUTED, RUST, tabBtn } from "@/lib/theme";
import { Metric } from "@/lib/ui";
import { INIT, STORE_KEY, STATUSES, parseJob, saveJob, removeJob, selectJobs, summarize, validateState } from "./model";
import styles from "./career.module.css";

const EMPTY = { company: "", role: "", url: "", status: "considering", appliedAt: "", nextStep: "", nextStepAt: "", notes: "", description: "" };

export function CareerView({ store }) {
  const { data, setData, ready, status, error, reload, sync, syncError, retrySync } = store;
  const [tab, setTab] = useState("jobs");
  const [draft, setDraft] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [validation, setValidation] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const validated = useMemo(() => {
    if (!data) return { state: INIT, error: "" };
    try { return { state: validateState(data), error: "" }; }
    catch { return { state: INIT, error: "נתוני הקריירה אינם בפורמט נתמך. לא נשנה אותם; יש לבדוק את הנתונים לפני המשך העבודה" }; }
  }, [data]);
  const state = validated.state;
  const summary = summarize(state);
  const results = selectJobs(state.jobs, query, filter, page);

  function edit(job = null) {
    setDraft(job ? Object.fromEntries(Object.keys(EMPTY).map(key => [key, job[key] ?? ""])) : { ...EMPTY });
    setEditingId(job?.id ?? null);
    setValidation("");
    setDeletingId(null);
  }

  function submit(event) {
    event.preventDefault();
    setValidation("");
    try {
      const next = saveJob(state, parseJob(draft), editingId);
      setData(next);
      setDraft(null); setEditingId(null); setPage(1);
    } catch (failure) { setValidation(failure.message); }
  }

  function confirmDelete() {
    setData(removeJob(state, deletingId));
    setDeletingId(null);
  }

  function field(name, label, type = "text", required = false, maxLength = 500) {
    return <label className={styles.field}>
      <span>{label}{required ? " *" : ""}</span>
      <input className="hq-field" style={inputStyle} type={type} required={required} maxLength={maxLength}
        value={draft[name]} onChange={event => setDraft({ ...draft, [name]: event.target.value })}
        dir={type === "url" || type === "date" ? "ltr" : undefined} />
    </label>;
  }

  if (!ready || validated.error) return <section aria-live="polite">
    <p role={error || validated.error ? "alert" : "status"}>{validated.error || error || "טוען את המועמדויות שלך…"}</p>
    {error && <button onClick={reload}>ניסיון נוסף</button>}
  </section>;

  return <div className={styles.root} dir="rtl">
    <p style={{ color: MUTED }}>מקום אחד למשרות, מועמדויות והצעד הבא שלך.</p>
    <div className={styles.metrics}>
      <Metric label="מועמדויות פעילות" value={summary.activeJobs} />
      <Metric label="ראיונות" value={summary.interviews} />
      <Metric label="צעדים באיחור" value={summary.overdue} color={summary.overdue ? RUST : undefined} />
    </div>
    {summary.nextStep && <p className={styles.next}>הצעד הבא: {summary.nextStep.text} · {summary.nextStep.company}{summary.nextStep.date ? ` · ${summary.nextStep.date}` : " · ללא מועד"}</p>}
    <nav aria-label="מחלקות הקריירה" className={styles.tabs}>
      <button style={tabBtn(tab === "jobs")} onClick={() => setTab("jobs")}>מועמדויות</button>
      <button style={tabBtn(tab === "plan")} onClick={() => setTab("plan")}>תוכנית השילוב</button>
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
    {tab === "plan" ? <section style={cardStyle}>
      <h2>מערכת הקריירה שלך, בתוך Personal HQ</h2>
      <p>מעקב מועמדויות זמין כאן כעת. קורות חיים, תרגול, ראיונות ומשוב AI יועברו בשלבים הבאים, יחד עם בקרת גישה ובדיקות.</p>
      <p>הנתונים מהמערכת הקודמת עדיין לא הועברו. כלים אלה ממשיכים להיות זמינים בה:</p>
      <a href="https://pm-interview-prep-ivory.vercel.app" target="_blank" rel="noopener noreferrer">פתיחת מערכת הקריירה הקיימת</a>
      <p>קישורי משרות נשמרים כאן כקישורים בלבד. ניתוח אוטומטי עדיין לא מחובר.</p>
    </section> : <>
      <div className={styles.toolbar}>
        <h2>המועמדויות שלי</h2>
        {!draft && <button style={primaryBtn} className={styles.button} disabled={!!deletingId} onClick={() => edit()}>הוספת מועמדות</button>}
      </div>
      {draft && <form style={cardStyle} className={styles.form} onSubmit={submit}>
        <h3>{editingId ? "עריכת מועמדות" : "מועמדות חדשה"}</h3>
        <fieldset>
          <div className={styles.grid}>
            {field("company", "חברה", "text", true, 160)}
            {field("role", "תפקיד", "text", true, 200)}
            {field("url", "קישור למשרה", "url", false, 2048)}
            <label className={styles.field}><span>סטטוס</span><select className="hq-field" style={inputStyle} value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}>
              {Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            {field("appliedAt", "תאריך הגשה", "date")}
            {field("nextStepAt", "מועד הצעד הבא", "date")}
          </div>
          {field("nextStep", "הצעד הבא")}
          <label className={styles.field}><span>הערות</span><textarea className="hq-field" style={inputStyle} rows={3} maxLength={6000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
          <label className={styles.field}><span>תיאור המשרה</span><textarea className="hq-field" style={inputStyle} rows={4} maxLength={12000} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
          {validation && <p role="alert" className={styles.error}>{validation}</p>}
          <div className={styles.actions}>
            <button type="submit" style={primaryBtn} className={styles.button}>שמירת מועמדות</button>
            <button type="button" className={styles.button} onClick={() => { setDraft(null); setValidation(""); }}>ביטול</button>
          </div>
        </fieldset>
      </form>}
      <div className={styles.grid}>
        <label className={styles.field}><span>חיפוש חברה או תפקיד</span><input className="hq-field" style={inputStyle} type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
        <label className={styles.field}><span>סינון לפי סטטוס</span><select className="hq-field" style={inputStyle} value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}>
          <option value="all">כל הסטטוסים</option>{Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      <p style={{ color: MUTED }}>{results.total} מועמדויות בתוצאות</p>
      {!results.total && <p className={styles.empty}>{state.jobs.length ? "אין מועמדויות שמתאימות לחיפוש" : "כאן תופיע המועמדות הראשונה שלך. מספיק להתחיל בשם החברה ובתפקיד."}</p>}
      <div aria-label="רשימת מועמדויות">
        {results.items.map(job => <article key={job.id} style={cardStyle} className={styles.job}>
          <div className={styles.toolbar}><h3>{job.role}</h3><span className={styles.badge}>{STATUSES[job.status]}</span></div>
          <p>{job.company}</p>
          <p style={{ color: MUTED }}>תאריך הגשה: {job.appliedAt || "לא הוזן"}</p>
          {job.nextStep && <p>הצעד הבא: {job.nextStep}{job.nextStepAt ? ` · ${job.nextStepAt}` : ""}</p>}
          {job.url && <a href={job.url} target="_blank" rel="noopener noreferrer">פתיחת המשרה באתר החברה ↗</a>}
          {(job.notes || job.description) && <details><summary>הערות ותיאור המשרה</summary><p className={styles.text}>{job.notes || "אין הערות"}</p><p className={styles.text}>{job.description}</p></details>}
          {deletingId === job.id ? <div role="alert" className={styles.actions}>
            <span>למחוק את המועמדות הזאת? לא ניתן לשחזר אותה מהמסך.</span>
            <button className={styles.button} onClick={confirmDelete}>אישור מחיקה</button>
            <button className={styles.button} onClick={() => setDeletingId(null)}>ביטול</button>
          </div> : <div className={styles.actions}>
            <button className={styles.button} disabled={!!draft || !!deletingId} onClick={() => edit(job)}>עריכה</button>
            <button className={styles.button} disabled={!!draft || !!deletingId} onClick={() => setDeletingId(job.id)}>מחיקה</button>
          </div>}
        </article>)}
      </div>
      <nav aria-label="עמודי מועמדויות" className={styles.pagination}>
        <button className={styles.button} disabled={results.page === 1} onClick={() => setPage(results.page - 1)}>הקודם</button>
        <span>עמוד {results.page} מתוך {results.pages}</span>
        <button className={styles.button} disabled={results.page === results.pages} onClick={() => setPage(results.page + 1)}>הבא</button>
      </nav>
    </>}
  </div>;
}

export default function Company() {
  const store = useStore(STORE_KEY, INIT);
  return <CareerView store={store} />;
}
