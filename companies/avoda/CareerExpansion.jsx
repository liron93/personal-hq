"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import questions from "./data/questions.json";
import concepts from "./data/concepts.json";
import styles from "./career.module.css";

const difficultyLabels = { easy: "קל", medium: "בינוני", hard: "מתקדם" };

export function PracticeHub({ user, jobs }) {
  const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [selected, setSelected] = useState(null);
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const categories = [...new Set(questions.map(item => item.category))];
  const visible = questions.filter(item => (category === "all" || item.category === category) && (difficulty === "all" || item.difficulty === difficulty));
  const submit = async event => {
    event.preventDefault();
    if (!answer.trim() || !selected) return;
    setSaving(true); setMessage("");
    const result = await supabase.from("career_answers").insert({ user_id: user.id, question_id: selected.id, answer_text: answer.trim() }).select().single();
    setSaving(false);
    if (result.error) { setMessage("התשובה לא נשמרה. נסה/י שוב."); return; }
    setMessage("התשובה נשמרה בהיסטוריה. הערכת AI אינה מופעלת עדיין, כדי לא להשתמש במפתח חיצוני ללא הגדרה מפורשת.");
  };
  if (selected) return <section className={styles.panel}><div className={styles.sectionTitle}><div><p>{selected.category} · {difficultyLabels[selected.difficulty]}</p><h2>תרגול שאלה</h2></div><button className={styles.close} onClick={() => {setSelected(null);setAnswer("");setMessage("");}}>חזרה לבנק</button></div>
    <article className={styles.practiceQuestion}><h3>{selected.question}</h3>{selected.hint && <details><summary>רמז</summary><p>{selected.hint}</p></details>}</article>
    <form className={styles.form} onSubmit={submit}><label className={styles.field}><span>התשובה שלך</span><textarea rows="9" value={answer} onChange={event => setAnswer(event.target.value)} placeholder="כתוב/י תשובה כפי שהיית אומר/ת אותה בראיון" /></label>{message && <p className={styles.notice}>{message}</p>}<button className={styles.primary} disabled={saving}>{saving ? "שומר…" : "שמירת ניסיון"}</button></form>
  </section>;
  return <section className={styles.panel}><div className={styles.sectionTitle}><div><p>העברה מלאה של מאגר השאלות</p><h2>תרגול ושאלות</h2></div><span className={styles.active}>{questions.length} שאלות</span></div>
    <div className={styles.listTools}><select value={category} onChange={event => setCategory(event.target.value)}><option value="all">כל הקטגוריות</option>{categories.map(item => <option key={item}>{item}</option>)}</select><select value={difficulty} onChange={event => setDifficulty(event.target.value)}><option value="all">כל הרמות</option>{Object.entries(difficultyLabels).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></div>
    <div className={styles.questionGrid}>{visible.map(item => <button className={styles.questionCard} key={item.id} onClick={() => setSelected(item)}><span>{item.category} · {difficultyLabels[item.difficulty]}</span><strong>{item.question}</strong><small>{item.frameworks?.join(" · ")}</small></button>)}</div>
  </section>;
}

export function HistoryHub({ user }) {
  const [answers, setAnswers] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => { let live=true; supabase.from("career_answers").select("id, question_id, answer_text, overall_score, created_at, career_questions(question, category)").eq("user_id",user.id).order("created_at",{ascending:false}).then(({data}) => { if(live){setAnswers(data||[]);setLoading(false);} }); return () => {live=false}; },[user.id]);
  return <section className={styles.panel}><div className={styles.sectionTitle}><div><p>רצף ושיפור</p><h2>היסטוריית תרגול</h2></div><span className={styles.active}>{answers.length} ניסיונות</span></div>
    {loading ? <p className={styles.muted}>טוען היסטוריה…</p> : <div className={styles.historyList}>{answers.map(item => <article className={styles.historyItem} key={item.id}><div><strong>{item.career_questions?.question || item.question_id}</strong><small>{item.career_questions?.category} · {new Date(item.created_at).toLocaleDateString("he-IL")}</small></div><p>{item.answer_text}</p></article>)}</div>}
    {!loading && !answers.length && <div className={styles.empty}><p>אין ניסיונות שמורים עדיין.</p></div>}
  </section>;
}

export function InterviewHub({ user, jobs }) {
  const [sessions, setSessions] = useState([]); const [session, setSession] = useState(null); const [persona,setPersona]=useState("hiring_manager"); const [jobId,setJobId]=useState(""); const [answer,setAnswer]=useState(""); const [message,setMessage]=useState("");
  const load = async () => { const {data}=await supabase.from("career_interview_sessions").select("*").eq("user_id",user.id).order("started_at",{ascending:false}); setSessions(data||[]); };
  useEffect(() => { load(); }, []);
  const start = async () => { setMessage(""); const job=jobs.find(item=>item.id===jobId); const created=await supabase.from("career_interview_sessions").insert({user_id:user.id,job_id:jobId||null,persona,role_title:job?.role_title||null}).select().single(); if(created.error){setMessage("לא ניתן להתחיל סימולציה.");return;} const prompt=questions[Math.floor(Math.random()*questions.length)]; await supabase.from("career_interview_messages").insert([{session_id:created.data.id,user_id:user.id,ordinal:1,speaker:"interviewer",content:prompt.question}]); setSession({...created.data,prompt}); await load(); };
  const send = async event => { event.preventDefault(); if(!answer.trim()||!session)return; const {data:all}=await supabase.from("career_interview_messages").select("ordinal").eq("session_id",session.id).order("ordinal",{ascending:false}).limit(1); const ordinal=(all?.[0]?.ordinal||1)+1; const result=await supabase.from("career_interview_messages").insert({session_id:session.id,user_id:user.id,ordinal,speaker:"candidate",content:answer.trim()}); if(result.error){setMessage("התשובה לא נשמרה.");return;} setAnswer("");setMessage("התשובה נשמרה בסימולציה. אפשר לסיים ולחזור להיסטוריה."); };
  const end = async () => { await supabase.from("career_interview_sessions").update({state:"completed",finished_at:new Date().toISOString()}).eq("id",session.id); setSession(null); await load(); };
  if(session) return <section className={styles.panel}><div className={styles.sectionTitle}><div><p>סימולציה מובנית · {session.persona==="hr"?"HR":"מנהל/ת מגייס/ת"}</p><h2>{session.role_title||"ראיון כללי"}</h2></div><button className={styles.close} onClick={end}>סיום סימולציה</button></div><article className={styles.practiceQuestion}><span>המראיין/ת שואל/ת</span><h3>{session.prompt.question}</h3></article><form className={styles.form} onSubmit={send}><label className={styles.field}><span>התשובה שלך</span><textarea rows="8" value={answer} onChange={event=>setAnswer(event.target.value)} placeholder="עני/ה בקולך; התשובה תישמר בסשן"/></label>{message&&<p className={styles.notice}>{message}</p>}<button className={styles.primary}>שמירת תשובה</button></form><p className={styles.muted}>זוהי סימולציה מובנית על בסיס בנק השאלות. משוב שיחה של AI יתווסף רק לאחר קביעת מנגנון מאובטח למפתח AI.</p></section>;
  return <section className={styles.panel}><div className={styles.sectionTitle}><div><p>תרגול תרחיש</p><h2>הכנה לראיון</h2></div><span className={styles.active}>{sessions.filter(item=>item.state==="completed").length} סימולציות</span></div><div className={styles.formGrid}><label className={styles.field}><span>סוג מראיין/ת</span><select value={persona} onChange={event=>setPersona(event.target.value)}><option value="hiring_manager">מנהל/ת מגייס/ת</option><option value="hr">HR</option></select></label><label className={styles.field}><span>משרה (אופציונלי)</span><select value={jobId} onChange={event=>setJobId(event.target.value)}><option value="">ראיון כללי</option>{jobs.map(job=><option key={job.id} value={job.id}>{job.company_name} · {job.role_title}</option>)}</select></label></div>{message&&<p className={styles.error}>{message}</p>}<button className={styles.primary} onClick={start}>התחלת סימולציה</button></section>;
}

export function LearningHub({ user }) {
  const [query,setQuery]=useState(""); const [articles,setArticles]=useState([]); const [draft,setDraft]=useState({url:"",title:"",summary:""}); const [message,setMessage]=useState("");
  const load=async()=>{const {data}=await supabase.from("career_article_summaries").select("*").eq("user_id",user.id).order("created_at",{ascending:false});setArticles(data||[])};
  useEffect(()=>{load()},[]);
  const save=async event=>{event.preventDefault();setMessage("");if(!draft.url.startsWith("https://")){setMessage("יש להזין קישור HTTPS מלא.");return;}const result=await supabase.from("career_article_summaries").insert({user_id:user.id,...draft,key_points:[]}).select().single();if(result.error){setMessage("המאמר לא נשמר.");return;}setArticles(items=>[result.data,...items]);setDraft({url:"",title:"",summary:""});setMessage("המאמר נשמר.");};
  const shown=concepts.filter(item=>(item.term+" "+item.category+" "+item.explanation).toLowerCase().includes(query.toLowerCase()));
  return <div className={styles.stack}><section className={styles.panel}><div className={styles.sectionTitle}><div><p>מילון מקצועי שהועבר מ־Job-guide</p><h2>מושגים ולמידה</h2></div><span className={styles.active}>{concepts.length} מושגים</span></div><input className={styles.search} value={query} onChange={event=>setQuery(event.target.value)} placeholder="חיפוש מושג או מסגרת עבודה"/><div className={styles.concepts}>{shown.slice(0,24).map(item=><article className={styles.concept} key={item.term}><span>{item.category}</span><h3>{item.term}</h3><p>{item.explanation}</p></article>)}</div></section>
    <section className={styles.panel}><div className={styles.sectionTitle}><div><p>מאמרים שברצונך לחזור אליהם</p><h2>ספריית מאמרים</h2></div></div><form className={styles.form} onSubmit={save}><div className={styles.formGrid}><label className={styles.field}><span>קישור HTTPS</span><input type="url" value={draft.url} onChange={event=>setDraft({...draft,url:event.target.value})}/></label><label className={styles.field}><span>כותרת</span><input value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})}/></label></div><label className={styles.field}><span>סיכום אישי</span><textarea rows="3" value={draft.summary} onChange={event=>setDraft({...draft,summary:event.target.value})}/></label>{message&&<p className={styles.notice}>{message}</p>}<button className={styles.primary}>שמירת מאמר</button></form><div className={styles.historyList}>{articles.map(item=><article key={item.id} className={styles.historyItem}><div><a href={item.url} target="_blank" rel="noreferrer"><strong>{item.title||item.url}</strong></a><small>{new Date(item.created_at).toLocaleDateString("he-IL")}</small></div>{item.summary&&<p>{item.summary}</p>}</article>)}</div></section>
  </div>;
}
