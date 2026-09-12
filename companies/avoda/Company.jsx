"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./career.module.css";

const STATUS = {
  considering: "לבדיקה",
  applied: "הוגשה",
  interview: "ראיון",
  offer: "הצעה",
  rejected: "נדחתה",
  withdrawn: "נסגרה",
};
const NAV = [
  ["today", "היום"],
  ["jobs", "משרות"],
  ["profile", "פרופיל"],
  ["cv", "קורות חיים"],
];
const blankProfile = { full_name: "", job_title: "", years_experience: "", experience_areas: "", looking_for: "", target_companies: "", strengths: "", improvement_areas: "", additional_notes: "" };
const blankJob = { company_name: "", role_title: "", job_url: "", job_description: "", status: "considering", next_action: "", next_action_at: "", notes: "" };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
const arrayValue = value => value.split(",").map(item => item.trim()).filter(Boolean);
const profileForm = profile => ({ ...blankProfile, ...profile, years_experience: profile?.years_experience ?? "", experience_areas: (profile?.experience_areas || []).join(", "), target_companies: (profile?.target_companies || []).join(", ") });

function useCareerData() {
  const [user, setUser] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [profile, setProfile] = useState(null);
  const [cvs, setCvs] = useState([]);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");

  const load = async () => {
    setState("loading"); setError("");
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) { setUser(null); setState("ready"); return; }
    setUser(auth.user);
    const [jobsResult, profileResult, cvResult] = await Promise.all([
      supabase.from("career_jobs").select("*").eq("user_id", auth.user.id).order("updated_at", { ascending: false }),
      supabase.from("career_profiles").select("*").eq("user_id", auth.user.id).maybeSingle(),
      supabase.from("career_cvs").select("*").eq("user_id", auth.user.id).order("created_at", { ascending: false }),
    ]);
    const firstError = jobsResult.error || profileResult.error || cvResult.error;
    if (firstError) { setError("לא ניתן לטעון את נתוני הקריירה כרגע."); setState("error"); return; }
    setJobs(jobsResult.data || []); setProfile(profileResult.data || null); setCvs(cvResult.data || []); setState("ready");
  };
  useEffect(() => { load(); }, []);

  const saveJob = async (draft, id) => {
    if (!user) return { error: "יש להתחבר לפני שמירה." };
    const payload = { ...draft, user_id: user.id, updated_at: new Date().toISOString() };
    const result = id
      ? await supabase.from("career_jobs").update(payload).eq("id", id).select().single()
      : await supabase.from("career_jobs").insert(payload).select().single();
    if (result.error) return { error: "המשרה לא נשמרה. בדוק/י את השדות ונסה/י שוב." };
    setJobs(items => id ? items.map(item => item.id === id ? result.data : item) : [result.data, ...items]);
    if (id) await supabase.from("career_job_activity").insert({ user_id: user.id, job_id: id, activity_type: "updated", summary: "פרטי המשרה עודכנו" });
    return { data: result.data };
  };
  const saveProfile = async (draft) => {
    if (!user) return { error: "יש להתחבר לפני שמירה." };
    const payload = {
      user_id: user.id, full_name: draft.full_name || null, job_title: draft.job_title || null,
      years_experience: draft.years_experience === "" ? null : Number(draft.years_experience),
      experience_areas: arrayValue(draft.experience_areas), looking_for: draft.looking_for || null,
      target_companies: arrayValue(draft.target_companies), strengths: draft.strengths || null,
      improvement_areas: draft.improvement_areas || null, additional_notes: draft.additional_notes || null,
      setup_completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    const result = await supabase.from("career_profiles").upsert(payload).select().single();
    if (result.error) return { error: "הפרופיל לא נשמר." };
    setProfile(result.data); return { data: result.data };
  };
  const uploadCv = async file => {
    if (!user) return { error: "יש להתחבר לפני העלאת קובץ." };
    if (file.type !== "application/pdf") return { error: "אפשר להעלות PDF בלבד." };
    if (file.size > 10 * 1024 * 1024) return { error: "גודל הקובץ המרבי הוא 10MB." };
    const path = user.id + "/" + crypto.randomUUID() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const upload = await supabase.storage.from("career-documents").upload(path, file, { contentType: "application/pdf", upsert: false });
    if (upload.error) return { error: "הקובץ לא עלה. נסה/י שוב." };
    const deactivate = await supabase.from("career_cvs").update({ is_active: false, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("is_active", true);
    if (deactivate.error) return { error: "הקובץ עלה אך לא ניתן לעדכן את גרסת הקו״ח הפעילה." };
    const saved = await supabase.from("career_cvs").insert({ user_id: user.id, storage_path: path, filename: file.name, mime_type: file.type, size_bytes: file.size, is_active: true, updated_at: new Date().toISOString() }).select().single();
    if (saved.error) return { error: "הקובץ עלה אך רשומת הקו״ח לא נשמרה." };
    setCvs(items => [saved.data, ...items.map(item => ({ ...item, is_active: false }))]); return { data: saved.data };
  };
  const makeActive = async id => {
    if (!user) return;
    await supabase.from("career_cvs").update({ is_active: false, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("is_active", true);
    const saved = await supabase.from("career_cvs").update({ is_active: true, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (!saved.error) setCvs(items => items.map(item => ({ ...item, is_active: item.id === id })));
  };
  return { user, jobs, profile, cvs, state, error, load, saveJob, saveProfile, uploadCv, makeActive };
}

function Notice({ children, kind = "info" }) { return <p className={kind === "error" ? styles.error : styles.notice} role={kind === "error" ? "alert" : undefined}>{children}</p>; }
function Status({ value }) { return <span className={styles["status_" + value] || styles.status}>{STATUS[value] || value}</span>; }

function Today({ jobs, onOpen, onNavigate }) {
  const day = today();
  const active = jobs.filter(job => !["rejected", "withdrawn"].includes(job.status));
  const due = active.filter(job => job.next_action_at && job.next_action_at <= day).sort((a,b) => (a.next_action_at || "").localeCompare(b.next_action_at || ""));
  const missing = active.filter(job => !job.next_action || !job.next_action_at);
  const focus = due[0] || missing[0];
  return <div className={styles.stack}>
    <section className={styles.hero}>
      <span>מרכז הפיקוד של הקריירה</span>
      <h2>{focus ? "יש פעולה אחת שכדאי לקדם עכשיו." : "הצינור שלך מסודר לעכשיו."}</h2>
      <p>{focus ? focus.company_name + " · " + focus.role_title : "אפשר להוסיף משרה או לעדכן את הפעולה הבאה בכל תהליך פתוח."}</p>
      {focus && <button className={styles.primary} onClick={() => onOpen(focus)}>להמשיך במשרה</button>}
    </section>
    <section className={styles.kpis}>
      <Metric label="פעילות" value={active.length} />
      <Metric label="ראיונות" value={active.filter(job => job.status === "interview").length} />
      <Metric label="דורש טיפול" value={due.length} warn={due.length > 0} />
      <Metric label="ללא צעד הבא" value={missing.length} />
    </section>
    <section className={styles.panel}>
      <div className={styles.sectionTitle}><div><p>תור הפעולות</p><h3>מה יקדם אותך השבוע</h3></div><button className={styles.textButton} onClick={() => onNavigate("jobs")}>לכל המשרות</button></div>
      {due.length ? due.slice(0,5).map(job => <button className={styles.actionRow} onClick={() => onOpen(job)} key={job.id}><span><strong>{job.next_action}</strong><small>{job.company_name} · {job.role_title}</small></span><time>{job.next_action_at}</time></button>) : <Empty label="אין פעולה דחופה כרגע" action="הוספת משרה" onClick={() => onNavigate("jobs")} />}
    </section>
  </div>;
}

function Jobs({ jobs, onSave, onOpen }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(blankJob);
  const [message, setMessage] = useState("");
  const visible = jobs.filter(job => (filter === "all" || job.status === filter) && (job.company_name + " " + job.role_title).toLowerCase().includes(query.toLowerCase()));
  const create = async event => {
    event.preventDefault(); setMessage("");
    if (!draft.company_name.trim() || !draft.role_title.trim()) { setMessage("יש למלא חברה ותפקיד."); return; }
    const result = await onSave(draft);
    if (result.error) { setMessage(result.error); return; }
    setDraft(blankJob); setAdding(false);
  };
  return <div className={styles.stack}>
    <section className={styles.panel}>
      <div className={styles.sectionTitle}><div><p>צינור מועמדויות</p><h2>משרות</h2></div><button className={styles.primary} onClick={() => setAdding(value => !value)}>{adding ? "סגירה" : "+ משרה חדשה"}</button></div>
      {adding && <form className={styles.form} onSubmit={create}>
        <div className={styles.formGrid}><Field label="חברה" value={draft.company_name} onChange={value => setDraft({...draft, company_name:value})} required /><Field label="תפקיד" value={draft.role_title} onChange={value => setDraft({...draft, role_title:value})} required /></div>
        <Field label="קישור למשרה" type="url" value={draft.job_url} onChange={value => setDraft({...draft, job_url:value})} placeholder="נשמר כקישור בלבד; לא מבוצעת משיכה אוטומטית" />
        <Field label="תיאור המשרה" multiline value={draft.job_description} onChange={value => setDraft({...draft, job_description:value})} />
        <div className={styles.formGrid}><SelectStatus value={draft.status} onChange={value => setDraft({...draft, status:value})} /><Field label="הפעולה הבאה" value={draft.next_action} onChange={value => setDraft({...draft, next_action:value})} /><Field label="מועד" type="date" value={draft.next_action_at} onChange={value => setDraft({...draft, next_action_at:value})} /></div>
        {message && <Notice kind="error">{message}</Notice>}<button className={styles.primary}>שמירת משרה</button>
      </form>}
      <div className={styles.listTools}><input aria-label="חיפוש משרות" placeholder="חיפוש חברה או תפקיד" value={query} onChange={event => setQuery(event.target.value)} /><select aria-label="סינון סטטוס" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">כל הסטטוסים</option>{Object.entries(STATUS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className={styles.jobList}>{visible.map(job => <button onClick={() => onOpen(job)} key={job.id} className={styles.jobCard}><span className={styles.jobIdentity}><strong>{job.role_title}</strong><small>{job.company_name}</small></span><span><Status value={job.status} /><small>{job.next_action_at || "ללא מועד"}</small></span></button>)}</div>
      {!visible.length && <Empty label={jobs.length ? "לא נמצאו משרות בסינון הזה" : "עדיין אין משרות במרכז הקריירה"} action="הוספת המשרה הראשונה" onClick={() => setAdding(true)} />}
    </section>
  </div>;
}

function JobDetail({ job, onClose, onSave }) {
  const [draft, setDraft] = useState({...blankJob, ...job, next_action_at: job.next_action_at || ""});
  const [message, setMessage] = useState("");
  const save = async event => { event.preventDefault(); const result = await onSave(draft, job.id); if (result.error) setMessage(result.error); else onClose(); };
  const qs = Array.isArray(job.tailored_questions) ? job.tailored_questions : [];
  return <div className={styles.sheetBackdrop} role="dialog" aria-modal="true" aria-label="פרטי משרה"><section className={styles.sheet}>
    <div className={styles.sectionTitle}><div><p>{job.company_name}</p><h2>{job.role_title}</h2></div><button className={styles.close} onClick={onClose}>סגירה</button></div>
    <form className={styles.form} onSubmit={save}>
      <div className={styles.formGrid}><SelectStatus value={draft.status} onChange={value => setDraft({...draft, status:value})} /><Field label="פעולה הבאה" value={draft.next_action} onChange={value => setDraft({...draft, next_action:value})} /><Field label="מועד" type="date" value={draft.next_action_at} onChange={value => setDraft({...draft, next_action_at:value})} /></div>
      <Field label="הערות" multiline value={draft.notes || ""} onChange={value => setDraft({...draft, notes:value})} />
      <Field label="קישור למשרה" type="url" value={draft.job_url || ""} onChange={value => setDraft({...draft, job_url:value})} />
      {message && <Notice kind="error">{message}</Notice>}<button className={styles.primary}>שמירת עדכון</button>
    </form>
    <Detail title="התאמה" text={job.fit_summary} /><Detail title="תיאור המשרה" text={job.job_description} />
    {qs.length > 0 && <section className={styles.detail}><h3>שאלות הכנה שמורות</h3>{qs.map((item,index) => <article className={styles.question} key={index}><strong>{item.question || "שאלה " + (index + 1)}</strong>{item.suggested_answer && <p>{item.suggested_answer}</p>}</article>)}</section>}
  </section></div>;
}

function Profile({ profile, onSave }) {
  const [draft, setDraft] = useState(profileForm(profile));
  const [message, setMessage] = useState("");
  useEffect(() => setDraft(profileForm(profile)), [profile]);
  const save = async event => { event.preventDefault(); setMessage(""); const result = await onSave(draft); setMessage(result.error || "הפרופיל נשמר."); };
  return <section className={styles.panel}><div className={styles.sectionTitle}><div><p>הקשר מקצועי</p><h2>הפרופיל שלי</h2></div></div><p className={styles.muted}>הנתונים נשמרים בחשבון שלך ומשמשים בעתיד להתאמה והכנה. אין מפתח AI בשלב זה.</p>
    <form className={styles.form} onSubmit={save}><div className={styles.formGrid}><Field label="שם מלא" value={draft.full_name} onChange={value => setDraft({...draft,full_name:value})}/><Field label="תפקיד נוכחי / יעד" value={draft.job_title} onChange={value => setDraft({...draft,job_title:value})}/><Field label="שנות ניסיון" type="number" value={draft.years_experience} onChange={value => setDraft({...draft,years_experience:value})}/><Field label="תחומי ניסיון" value={draft.experience_areas} onChange={value => setDraft({...draft,experience_areas:value})} placeholder="מופרד בפסיקים"/></div><Field label="מה אני מחפש/ת" multiline value={draft.looking_for} onChange={value => setDraft({...draft,looking_for:value})}/><Field label="חברות יעד" value={draft.target_companies} onChange={value => setDraft({...draft,target_companies:value})} placeholder="מופרד בפסיקים"/><div className={styles.formGrid}><Field label="חוזקות" multiline value={draft.strengths} onChange={value => setDraft({...draft,strengths:value})}/><Field label="נקודות לחיזוק" multiline value={draft.improvement_areas} onChange={value => setDraft({...draft,improvement_areas:value})}/></div><Field label="הערות נוספות" multiline value={draft.additional_notes} onChange={value => setDraft({...draft,additional_notes:value})}/>{message && <Notice>{message}</Notice>}<button className={styles.primary}>שמירת פרופיל</button></form></section>;
}

function CvCenter({ cvs, onUpload, onActive }) {
  const [message, setMessage] = useState("");
  const upload = async event => { const file = event.target.files?.[0]; if (!file) return; setMessage("מעלה קובץ…"); const result = await onUpload(file); setMessage(result.error || "קובץ הקו״ח נשמר בצורה פרטית."); event.target.value = ""; };
  return <section className={styles.panel}><div className={styles.sectionTitle}><div><p>מסמכים מקצועיים</p><h2>מרכז קורות החיים</h2></div></div><p className={styles.muted}>PDF בלבד, עד 10MB. הקובץ מאוחסן ב־Storage פרטי ומוגן לפי חשבון המשתמש.</p>
    <label className={styles.dropzone}><input type="file" accept="application/pdf" onChange={upload}/><strong>העלאת קורות חיים</strong><span>בחר/י קובץ PDF מהמכשיר</span></label>{message && <Notice>{message}</Notice>}
    <div className={styles.cvList}>{cvs.map(cv => <article className={styles.cvCard} key={cv.id}><span><strong>{cv.filename}</strong><small>{cv.is_active ? "גרסה פעילה" : "גרסה קודמת"} · {new Date(cv.created_at).toLocaleDateString("he-IL")}</small></span>{cv.is_active ? <span className={styles.active}>פעיל</span> : <button className={styles.secondary} onClick={() => onActive(cv.id)}>הפוך לפעיל</button>}</article>)}</div>{!cvs.length && <Empty label="עדיין אין קובץ קו״ח בחשבון" action="העלאת PDF" onClick={() => document.querySelector('input[type=file]')?.click()} />}
  </section>;
}

function Field({ label, value, onChange, type="text", multiline, placeholder, required }) { return <label className={styles.field}><span>{label}</span>{multiline ? <textarea value={value || ""} onChange={event => onChange(event.target.value)} placeholder={placeholder} rows="4" /> : <input required={required} type={type} value={value || ""} onChange={event => onChange(event.target.value)} placeholder={placeholder} />}</label>; }
function SelectStatus({ value, onChange }) { return <label className={styles.field}><span>סטטוס</span><select value={value} onChange={event => onChange(event.target.value)}>{Object.entries(STATUS).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>; }
function Detail({ title, text }) { return text ? <section className={styles.detail}><h3>{title}</h3><p>{text}</p></section> : null; }
function Metric({ label, value, warn }) { return <div className={styles.metric}><span>{label}</span><strong className={warn ? styles.warn : ""}>{value}</strong></div>; }
function Empty({ label, action, onClick }) { return <div className={styles.empty}><p>{label}</p><button className={styles.secondary} onClick={onClick}>{action}</button></div>; }

export default function Company() {
  const data = useCareerData();
  const [view, setView] = useState("today");
  const [selected, setSelected] = useState(null);
  if (data.state === "loading") return <p className={styles.loading}>טוען את חברת הקריירה…</p>;
  if (!data.user) return <section className={styles.authRequired}><h2>כדי לעבוד עם הקריירה צריך להתחבר</h2><p>המערכת לא מציגה ולא שומרת נתוני קריירה ללא משתמש מחובר.</p></section>;
  if (data.state === "error") return <section><Notice kind="error">{data.error}</Notice><button className={styles.primary} onClick={data.load}>ניסיון נוסף</button></section>;
  return <div className={styles.root} dir="rtl">
    <aside className={styles.sidebar}><div className={styles.brand}><span>HQ</span><strong>קריירה</strong></div><nav aria-label="מחלקות קריירה">{NAV.map(([id,label]) => <button key={id} className={view === id ? styles.navActive : ""} onClick={() => setView(id)}>{label}</button>)}</nav><div className={styles.user}>{data.user.email}</div></aside>
    <main className={styles.main}><nav className={styles.mobileNav} aria-label="ניווט קריירה">{NAV.map(([id,label]) => <button key={id} className={view === id ? styles.navActive : ""} onClick={() => setView(id)}>{label}</button>)}</nav>
      {view === "today" && <Today jobs={data.jobs} onOpen={setSelected} onNavigate={setView}/>}
      {view === "jobs" && <Jobs jobs={data.jobs} onOpen={setSelected} onSave={data.saveJob}/>}
      {view === "profile" && <Profile profile={data.profile} onSave={data.saveProfile}/>}
      {view === "cv" && <CvCenter cvs={data.cvs} onUpload={data.uploadCv} onActive={data.makeActive}/>}
    </main>
    {selected && <JobDetail job={selected} onClose={() => setSelected(null)} onSave={data.saveJob}/>}
  </div>;
}