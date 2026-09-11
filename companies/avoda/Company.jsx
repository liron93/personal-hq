"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cardStyle, inputStyle, primaryBtn, MUTED, RUST, tabBtn } from "@/lib/theme";
import { Metric } from "@/lib/ui";
import styles from "./career.module.css";

const LABELS = {
  considering: "שוקל/ת להגיש", applied: "הוגשה מועמדות", interview: "ראיון",
  offer: "הצעה", rejected: "נדחתה", withdrawn: "נסגרה",
};
const CLOSED = new Set(["rejected", "withdrawn"]);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

function useCareerJobs() {
  const [jobs, setJobs] = useState([]);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");

  const load = async () => {
    setState("loading"); setError("");
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user) { setState("ready"); setJobs([]); return; }
    const { data, error: failure } = await supabase
      .from("career_jobs")
      .select("id, company_name, role_title, job_url, status, applied_at, notes, next_action, next_action_at, fit_score, should_apply, tailored_questions, candidate_questions, created_at")
      .eq("user_id", session.session.user.id)
      .order("next_action_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (failure) { setError("לא ניתן לטעון את הקריירה מהענן. נסה/י שוב."); setState("error"); return; }
    setJobs(data ?? []); setState("ready");
  };

  useEffect(() => { load(); }, []);
  const update = async (id, patch) => {
    setError("");
    const { data, error: failure } = await supabase.from("career_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (failure) { setError("השינוי לא נשמר. נסה/י שוב."); return false; }
    setJobs(old => old.map(job => job.id === id ? data : job));
    return true;
  };
  return { jobs, state, error, load, update };
}

function Actions({ title, hint, jobs, onOpen }) {
  if (!jobs.length) return null;
  return <section style={cardStyle} className={styles.queue}>
    <div className={styles.toolbar}><div><h3>{title}</h3><p style={{ color: MUTED }}>{hint}</p></div><span className={styles.count}>{jobs.length}</span></div>
    {jobs.slice(0, 6).map(job => <button key={job.id} className={styles.queueItem} onClick={() => onOpen(job)}>
      <span>{job.next_action || "חסר צעד הבא"}</span><small>{job.company_name} · {job.role_title}{job.next_action_at ? ` · ${job.next_action_at}` : ""}</small>
    </button>)}
  </section>;
}

export default function Company() {
  const { jobs, state, error, load, update } = useCareerJobs();
  const [tab, setTab] = useState("today");
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const currentDay = today();

  const stats = useMemo(() => {
    const active = jobs.filter(job => !CLOSED.has(job.status));
    const actions = active.filter(job => job.next_action);
    return {
      active: active.length,
      interviews: active.filter(job => job.status === "interview").length,
      overdue: actions.filter(job => job.next_action_at && job.next_action_at < currentDay).length,
      missing: active.filter(job => !job.next_action || !job.next_action_at).length,
    };
  }, [jobs, currentDay]);

  const queues = useMemo(() => {
    const active = jobs.filter(job => !CLOSED.has(job.status));
    return {
      overdue: active.filter(job => job.next_action_at && job.next_action_at < currentDay),
      today: active.filter(job => job.next_action_at === currentDay),
      upcoming: active.filter(job => job.next_action_at && job.next_action_at > currentDay).slice(0, 6),
      missing: active.filter(job => !job.next_action || !job.next_action_at),
    };
  }, [jobs, currentDay]);

  async function open(job) {
    setSelected(job);
    setDraft({ status: job.status, next_action: job.next_action || "", next_action_at: job.next_action_at || "", notes: job.notes || "" });
    setDetail(null);
    const { data } = await supabase.from("career_jobs").select("job_description, fit_summary, fit_pros, fit_cons, company_summary, product_summary, cover_letter, tailored_cv").eq("id", job.id).single();
    setDetail(data ?? {});
  }
  async function save() {
    if (!selected) return;
    setSaving(true);
    const ok = await update(selected.id, draft);
    setSaving(false);
    if (ok) { setSelected(null); setDetail(null); }
  }
  async function markDone(job) {
    await update(job.id, { next_action: null, next_action_at: null });
  }

  if (state === "loading") return <p>טוען את חברת הקריירה…</p>;
  if (state === "error") return <section><p role="alert">{error}</p><button style={primaryBtn} onClick={load}>ניסיון נוסף</button></section>;

  const questions = Array.isArray(selected?.tailored_questions) ? selected.tailored_questions : [];
  const practiceCount = jobs.reduce((total, job) => total + (Array.isArray(job.tailored_questions) ? job.tailored_questions.length : 0), 0);
  return <div className={styles.root} dir="rtl">
    <p style={{ color: MUTED }}>מרכז הפיקוד שלך למועמדויות, ראיונות והצעד הבא.</p>
    <div className={styles.metrics}>
      <Metric label="מועמדויות פעילות" value={stats.active} />
      <Metric label="ראיונות" value={stats.interviews} />
      <Metric label="באיחור" value={stats.overdue} color={stats.overdue ? RUST : undefined} />
      <Metric label="דורש הגדרה" value={stats.missing} />
    </div>
    <nav aria-label="מחלקות הקריירה" className={styles.tabs}>
      <button style={tabBtn(tab === "today")} onClick={() => setTab("today")}>היום</button>
      <button style={tabBtn(tab === "jobs")} onClick={() => setTab("jobs")}>משרות</button>
      <button style={tabBtn(tab === "interview")} onClick={() => setTab("interview")}>הכנה לראיון</button>
      <button style={tabBtn(tab === "readiness")} onClick={() => setTab("readiness")}>מוכנות</button>
    </nav>
    {error && <p role="alert" className={styles.error}>{error}</p>}

    {tab === "today" && <>
      <Actions title="דורש טיפול עכשיו" hint="צעדים שעבר מועד" jobs={queues.overdue} onOpen={open} />
      <Actions title="היום" hint="פעולות שמספיק לסיים היום" jobs={queues.today} onOpen={open} />
      <Actions title="בהמשך השבוע" hint="הצעדים הקרובים שלך" jobs={queues.upcoming} onOpen={open} />
      <Actions title="צריך להחליט מה הצעד הבא" hint="מועמדויות שלא כדאי שייעלמו" jobs={queues.missing} onOpen={open} />
      {!Object.values(queues).some(list => list.length) && <p className={styles.empty}>אין פעולה פתוחה כרגע. אפשר לעבור למשרות כדי לעדכן את התהליך.</p>}
    </>}

    {tab === "jobs" && <section style={cardStyle}>
      <div className={styles.toolbar}><h2>כל המשרות</h2><span style={{ color: MUTED }}>{jobs.length} רשומות</span></div>
      <div className={styles.jobList}>{jobs.map(job => <button key={job.id} className={styles.jobRow} onClick={() => open(job)}>
        <div><strong>{job.role_title}</strong><p>{job.company_name}</p></div>
        <div><span className={styles.badge}>{LABELS[job.status] || job.status}</span><small>{job.next_action_at || "ללא מועד"}</small></div>
      </button>)}</div>
    </section>}

    {tab === "interview" && <section style={cardStyle}>
      <h2>הכנה לראיון</h2>
      <p style={{ color: MUTED }}>בחר/י משרה כדי לראות את שאלות ההכנה שכבר נשמרו עבורה. יצירת שאלות AI חדשה תתווסף רק עם שכבת שרת מוגנת.</p>
      {jobs.filter(job => Array.isArray(job.tailored_questions) && job.tailored_questions.length).map(job => <button key={job.id} className={styles.jobRow} onClick={() => open(job)}>
        <div><strong>{job.role_title}</strong><p>{job.company_name}</p></div><span className={styles.badge}>{job.tailored_questions.length} שאלות</span>
      </button>)}
      {!jobs.some(job => Array.isArray(job.tailored_questions) && job.tailored_questions.length) && <p className={styles.empty}>עדיין אין שאלות הכנה שמורות למשרות הקיימות.</p>}
    </section>}

    {tab === "readiness" && <section style={cardStyle}>
      <h2>מוכנות לחיפוש ולראיון</h2>
      <div className={styles.metrics}>
        <Metric label="שאלות הכנה שמורות" value={practiceCount} />
        <Metric label="משרות בראיון" value={stats.interviews} />
        <Metric label="מועמדויות שהוגשו" value={jobs.filter(job => job.status === "applied").length} />
      </div>
      <p style={{ color: MUTED }}>זהו מדד פתיחה. מדדי תרגול מלאים, ציונים ורצף יועברו בשלב הבא עם טבלת תרגולים ייעודית.</p>
    </section>}

    {selected && <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="פרטי משרה">
      <section style={cardStyle} className={styles.modal}>
        <div className={styles.toolbar}><div><h2>{selected.role_title}</h2><p>{selected.company_name}</p></div><button className={styles.button} onClick={() => setSelected(null)}>סגירה</button></div>
        <div className={styles.grid}>
          <label className={styles.field}><span>סטטוס</span><select style={inputStyle} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}>{Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className={styles.field}><span>מועד הצעד הבא</span><input style={inputStyle} type="date" value={draft.next_action_at} onChange={e => setDraft({ ...draft, next_action_at: e.target.value })} /></label>
        </div>
        <label className={styles.field}><span>הצעד הבא</span><input style={inputStyle} value={draft.next_action} onChange={e => setDraft({ ...draft, next_action: e.target.value })} placeholder="למשל: לשלוח פולואפ למגייס/ת" /></label>
        <label className={styles.field}><span>הערות</span><textarea style={inputStyle} rows={3} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>
        <div className={styles.actions}><button style={primaryBtn} className={styles.button} disabled={saving} onClick={save}>{saving ? "שומר…" : "שמירת עדכון"}</button>{selected.next_action && <button className={styles.button} disabled={saving} onClick={() => markDone(selected)}>סימון הצעד כבוצע</button>}</div>
        {detail?.fit_summary && <details><summary>ניתוח התאמה</summary><p className={styles.text}>{detail.fit_summary}</p></details>}
        {questions.length > 0 && <details open><summary>שאלות הכנה לראיון</summary>{questions.map((q, i) => <article key={i} className={styles.question}><strong>{q.question || `שאלה ${i + 1}`}</strong>{q.suggested_answer && <p>{q.suggested_answer}</p>}</article>)}</details>}
        {detail?.job_description && <details><summary>תיאור המשרה</summary><p className={styles.text}>{detail.job_description}</p></details>}
      </section>
    </div>}
  </div>;
}