"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpLeft, BellRing, Bot, BriefcaseBusiness, Building2, ChevronLeft, CircleAlert, CircleCheck, Dumbbell, HeartPulse, Home, Landmark, MessageCircle, MoreHorizontal, Plus, Send, ShoppingBasket, Sparkles, WalletCards, X } from "lucide-react";
import { COMPANIES } from "@/companies/registry";
import { load, useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import * as coreFacts from "@/lib/coreFacts";
import styles from "./home.module.css";
import overlay from "./overlays.module.css";

// תלת-מימד (three.js) — client-only, בלי SSR: WebGL זקוק לדפדפן.
const JarvisOrb = dynamic(() => import("./JarvisOrb"), { ssr: false });

function useSummaries() {
  const [summaries, setSummaries] = useState({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const next = {};
      for (const company of COMPANIES) {
        try {
          const data = (await load(company.storeKey)) ?? company.init;
          next[company.slug] = { data, summary: company.summarize(data) };
        } catch { next[company.slug] = { data: company.init, summary: company.summarize(company.init) }; }
      }
      if (alive) setSummaries(next);
    })();
    return () => { alive = false; };
  }, []);
  return summaries;
}

const meta = {
  "beit-hadash": { icon: Home, tone: "orange", manager: "שקד" }, kesef: { icon: WalletCards, tone: "purple", manager: "שבתאי ואופק" },
  health: { icon: Dumbbell, tone: "green", manager: "גל" }, avoda: { icon: BriefcaseBusiness, tone: "blue", manager: "רועי" }, nefesh: { icon: HeartPulse, tone: "pink", manager: "אוריה" },
  household: { icon: ShoppingBasket, tone: "teal", manager: "מאיה" },
};
const money = value => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(value || 0);
function Flag({ flag }) { return <span className={`${styles.dot} ${flag === "amber" ? styles.dotAmber : flag === "green" ? styles.dotGreen : styles.dotNeutral}`} />; }

export default function CEO() {
  const summaries = useSummaries();
  const { data: core, upd: coreUpd, ready: coreReady } = useStore(coreFacts.STORE_KEY, coreFacts.INIT);
  const [menuOpen, setMenuOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [jarvisBriefing, setJarvisBriefing] = useState(null);
  const [jarvisChatOpen, setJarvisChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const today = new Date();
  const greeting = today.getHours() < 12 ? "בוקר טוב, לירון" : today.getHours() < 18 ? "צהריים טובים, לירון" : "ערב טוב, לירון";
  const companies = useMemo(() => COMPANIES.map(c => ({ ...c, summary: summaries[c.slug]?.summary, data: summaries[c.slug]?.data, ...meta[c.slug] })), [summaries]);
  const openTasks = companies.reduce((sum, c) => sum + (c.summary?.openTasks || 0), 0);
  const attention = companies.filter(c => c.summary?.flag === "amber");
  const career = summaries.avoda?.summary, home = summaries["beit-hadash"]?.summary?.renovation, finance = summaries.kesef?.summary, health = summaries.health?.summary;
  const latest = companies.filter(c => c.summary?.latestUpdate).sort((a, b) => new Date(b.summary.latestUpdate.date) - new Date(a.summary.latestUpdate.date))[0];
  const income = Number(core?.mySalary || 0) + Number(core?.wifeSalary || 0);
  const dateLabel = today.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  const urgentActions = useMemo(() => {
    const actions = [];
    const renovation = summaries["beit-hadash"]?.data;
    (renovation?.items || []).filter(item => item.beforeMove && item.status !== "הושלם").forEach(item => actions.push({ company: "בית חדש", text: `${item.name} — ${item.status}`, detail: "נדרש לפני הכניסה לדירה", href: "/companies/beit-hadash", tone: "home" }));
    const cash = summaries.kesef?.data;
    (cash?.tasks || []).filter(task => !task.done).forEach(task => actions.push({ company: "כלכלה והשקעות", text: task.title || task.name || task.text || "פעולה כספית", detail: "משימה פתוחה", href: "/companies/kesef", tone: "finance" }));
    if (career?.nextStep) actions.push({ company: "קריירה", text: `${career.nextStep.company} — ${career.nextStep.text}`, detail: career.nextStep.date ? `עד ${career.nextStep.date}` : "השלב הבא שלך", href: "/companies/avoda", tone: "career" });
    const wellbeing = summaries.nefesh?.data;
    (wellbeing?.decisions || []).filter(item => item.status === "open").forEach(item => actions.push({ company: "רווחה נפשית", text: item.title || item.text || "החלטה פתוחה", detail: "ממתין להחלטה", href: "/companies/nefesh", tone: "wellbeing" }));
    return actions.slice(0, 6);
  }, [summaries, career]);

  const jarvisContext = useMemo(() => {
    if (!Object.keys(summaries).length) return null;
    const homeItems = (summaries["beit-hadash"]?.data?.items || [])
      .filter(item => item.beforeMove && item.status !== "הושלם")
      .map(item => ({ name: item.name, status: item.status, dueDate: item.dueDate || null, estimate: item.estimate || null }));
    const wellbeingToday = summaries.nefesh?.data?.today;
    const openDecisions = (summaries.nefesh?.data?.decisions || [])
      .filter(item => item?.status === "open")
      .map(item => item.title || item.text)
      .filter(Boolean);
    return {
      greeting, openTasks, urgentActions,
      money: { income, mortgageMonthly: core?.mortgageMonthly ?? null },
      home: { items: homeItems, paid: home?.paid ?? null, planned: home?.planned ?? null },
      finance: { netWorth: finance?.netWorth ?? null, overBudget: finance?.overBudget ?? null },
      career: { activeJobs: career?.activeJobs ?? null, nextStep: career?.nextStep ?? null },
      health: { weekWorkouts: health?.weekWorkouts ?? null, weekMeals: health?.weekMeals ?? null, goal: health?.profile?.goal ?? null },
      wellbeing: { load: wellbeingToday?.load || null, status: wellbeingToday?.status || null, openDecisions },
    };
  }, [summaries, urgentActions, openTasks, greeting, income, core, home, finance, career, health]);

  useEffect(() => {
    if (!jarvisContext) return;
    let alive = true;
    fetch("/api/jarvis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(jarvisContext),
    })
      .then(res => (res.ok ? res.json() : null))
      .then(result => { if (alive && result?.headline) setJarvisBriefing(result); })
      .catch(() => {});
    return () => { alive = false; };
  }, [jarvisContext]);

  const sendChatMessage = async event => {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text || chatSending) return;
    setChatError("");
    setChatInput("");
    const nextMessages = [...chatMessages, { role: "user", text }];
    setChatMessages(nextMessages);
    setChatSending(true);
    try {
      const res = await fetch("/api/jarvis/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, context: jarvisContext }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.reply) { setChatError(data?.error || "JARVIS לא הצליח לענות."); return; }
      setChatMessages(list => [...list, { role: "model", text: data.reply }]);
    } catch {
      setChatError("שגיאה בפנייה ל-JARVIS.");
    } finally {
      setChatSending(false);
    }
  };

  return <main className={styles.page}>
    <div className={styles.aurora} aria-hidden="true" />
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/"><span className={styles.brandMark}><Building2 size={19} /></span><span>PERSONAL <b>HQ</b></span></Link>
      <div className={styles.headerActions}><button className={styles.iconButton} aria-label="התראות" onClick={() => setAlertsOpen(true)}><BellRing size={19} />{urgentActions.length > 0 && <i className={styles.notification} />}</button><button className={styles.avatar} aria-label="תפריט חשבון" onClick={() => setMenuOpen(v => !v)}>ל</button>{menuOpen && <div className={styles.accountMenu}><button onClick={() => supabase.auth.signOut()}>יציאה מאובטחת</button></div>}</div>
    </header>
    <section className={styles.hero}><div><p className={styles.date}>{dateLabel}</p><h1>{greeting}<span className={styles.wave}>✦</span></h1><p className={styles.heroCopy}>הכול במקום אחד. בוא נסדר את הדבר הבא שיקדם אותך היום.</p></div><div className={styles.heroActions}><button onClick={() => setQuickOpen(true)} className={styles.primaryAction}><Plus size={18} /> פעולה חדשה</button><a href="#companies" className={styles.secondaryAction}>לכל החברות <ArrowLeft size={17} /></a></div></section>
    <section className={styles.command}><div className={styles.commandIntro}><span className={styles.commandIcon}><Sparkles size={20} /></span><div><p>מרכז השליטה</p><strong>{urgentActions.length ? `${urgentActions.length} נושאים מחכים לתשומת לב` : "המערכת בשליטה. ממשיכים בתנופה."}</strong></div></div><div className={styles.commandStats}><div><b>{openTasks}</b><span>פעולות פתוחות</span></div><div><b>{career?.activeJobs || 0}</b><span>משרות פעילות</span></div><div><b>{home?.urgent || 0}</b><span>נושאי בית דחופים</span></div></div></section>
    <section className={styles.jarvisPanel} aria-label="מרכז הבינה של Personal HQ"><JarvisOrb className={styles.jarvisCore} /><div className={styles.jarvisCopy}><p><Bot size={15} /> JARVIS // PERSONAL HQ</p><h2>{jarvisBriefing?.headline || "אני מרכז עבורך את מה שדורש החלטה — בלי להעמיס."}</h2><span>{jarvisBriefing?.subtext || (urgentActions.length ? `זיהיתי ${urgentActions.length} פעולות שמומלץ לסגור קודם.` : "כרגע אין חסימה בולטת. נמשיך לעקוב.")}</span></div><div className={styles.jarvisActions}><button className={styles.jarvisAction} onClick={() => setAlertsOpen(true)}>פתח תדריך <ArrowLeft size={16} /></button><button className={styles.jarvisAction} onClick={() => setJarvisChatOpen(true)}><MessageCircle size={16} /> שאל את JARVIS</button></div></section>
    {urgentActions.length > 0 && <section className={overlay.urgentPanel} aria-label="פעולות דחופות"><div className={overlay.urgentTitle}><div><p className={styles.eyebrow}>דורש פעולה</p><h2>אלה הדברים שמחכים לך עכשיו</h2></div><button onClick={() => setAlertsOpen(true)}>לכל ההתראות <ArrowLeft size={16} /></button></div><div className={overlay.urgentList}>{urgentActions.slice(0, 3).map((action, index) => <Link href={action.href} key={`${action.company}-${index}`} className={overlay.urgentItem}><span className={`${overlay.urgentNumber} ${overlay[action.tone]}`}>{index + 1}</span><span className={overlay.urgentContent}><b>{action.text}</b><small>{action.company} · {action.detail}</small></span><ChevronLeft size={18} /></Link>)}</div></section>}
    <section className={styles.gridTop}><article className={`${styles.card} ${styles.nextCard}`}><div className={styles.cardTop}><div><p className={styles.eyebrow}>הדבר הבא</p><h2>{attention[0] ? `בדיקה מול ${attention[0].name}` : "סקירה יומית קצרה"}</h2></div><span className={styles.pulse}><span /></span></div>{career?.nextStep ? <p className={styles.nextDescription}>{career.nextStep.company}: {career.nextStep.text}</p> : <p className={styles.nextDescription}>פתח את החברה שהכי חשובה היום ובחר פעולה אחת קטנה לקידום.</p>}<Link href={attention[0] ? `/companies/${attention[0].slug}` : "/companies/beit-hadash"} className={styles.inlineLink}>לטיפול עכשיו <ArrowLeft size={16} /></Link></article><article className={`${styles.card} ${styles.moneyCard}`}><div className={styles.cardTop}><div><p className={styles.eyebrow}>תמונת כסף</p><h2>החודש שלך</h2></div><Landmark size={21} /></div><div className={styles.moneyRow}><span>הכנסה חודשית</span><strong>{money(income)}</strong></div><div className={styles.moneyRow}><span>משכנתא</span><strong>{money(core?.mortgageMonthly)}</strong></div><Link href="/companies/kesef" className={styles.inlineLink}>למרכז הכספים <ArrowLeft size={16} /></Link></article></section>
    <section className={styles.sectionHeader} id="companies"><div><p className={styles.eyebrow}>החברות שלי</p><h2>מה קורה בכל תחום</h2></div><span>{companies.length} פעילות</span></section>
    <section className={styles.companyGrid}>{companies.map(c => { const Icon = c.icon; const metric = c.slug === "beit-hadash" ? `${money(home?.paid)} שולם` : c.slug === "kesef" ? money(finance?.netWorth) : c.slug === "health" ? `${health?.weekWorkouts || 0} אימונים השבוע` : c.slug === "avoda" ? `${career?.activeJobs || 0} משרות פעילות` : `${c.summary?.openTasks || 0} נושאים פתוחים`; return <Link href={`/companies/${c.slug}`} key={c.slug} className={`${styles.companyCard} ${styles[c.tone]}`}><div className={styles.companyCardTop}><span className={styles.companyIcon}><Icon size={21} /></span><MoreHorizontal size={20} className={styles.more} /></div><div><h3>{c.name}</h3><p>מנכ״ל: {c.manager}</p></div><div className={styles.companyFoot}><div><strong>{metric}</strong><span><Flag flag={c.summary?.flag} /> {c.summary?.flag === "amber" ? "דורש תשומת לב" : "במסלול"}</span></div><span className={styles.cardArrow}><ChevronLeft size={19} /></span></div></Link>; })}</section>
    <section className={styles.gridBottom}><article className={styles.card}><div className={styles.cardTop}><div><p className={styles.eyebrow}>התקדמות בית חדש</p><h2>תקציב השיפוץ</h2></div><Home size={20} /></div><div className={styles.progressMeta}><strong>{money(home?.paid)}</strong><span>מתוך {money(home?.planned)}</span></div><div className={styles.progressTrack}><span style={{ width: `${Math.min(100, Math.round(((home?.paid || 0) / (home?.planned || 1)) * 100))}%` }} /></div><p className={styles.helper}>{home?.urgent || 0} פריטים שצריך לסגור לפני המעבר</p><Link href="/companies/beit-hadash" className={styles.inlineLink}>לניהול השיפוץ <ArrowLeft size={16} /></Link></article><article className={styles.card}><div className={styles.cardTop}><div><p className={styles.eyebrow}>קצב אישי</p><h2>אימון ותזונה</h2></div><Dumbbell size={20} /></div><div className={styles.healthKpis}><div><b>{health?.weekWorkouts || 0}</b><span>אימונים</span></div><div><b>{health?.weekMeals || 0}</b><span>דיווחי תזונה</span></div><div><b>{health?.profile?.goal || "—"}</b><span>מטרה</span></div></div><Link href="/companies/health" className={styles.inlineLink}>לעדכון היום <ArrowLeft size={16} /></Link></article><article className={`${styles.card} ${styles.feedCard}`}><div className={styles.cardTop}><div><p className={styles.eyebrow}>עדכון אחרון</p><h2>מה השתנה</h2></div><CircleCheck size={20} /></div>{latest ? <><p className={styles.feedText}>{latest.summary.latestUpdate.text}</p><Link href={`/companies/${latest.slug}`} className={styles.inlineLink}>ל{latest.name} <ArrowLeft size={16} /></Link></> : <p className={styles.feedText}>ברגע שתעדכן חברה, ההתקדמות תופיע כאן.</p>}</article></section>
    {coreReady && <section className={styles.coreStrip}><div><CircleAlert size={18} /><span>נתוני ליבה ניתנים לעריכה מהירה כאן</span></div><label>הכנסה שלך<input value={core.mySalary || ""} inputMode="numeric" onChange={e => coreUpd("mySalary", Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} /></label><label>הכנסת בת הזוג<input value={core.wifeSalary || ""} inputMode="numeric" onChange={e => coreUpd("wifeSalary", Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} /></label></section>}
    <footer className={styles.footer}>Personal HQ <span /> שליטה שקטה בחיים שלך <ArrowUpLeft size={14} /></footer>
    {(alertsOpen || quickOpen) && <div className={overlay.overlay} onClick={() => { setAlertsOpen(false); setQuickOpen(false); }}><section className={overlay.modal} onClick={event => event.stopPropagation()}><div className={overlay.modalTop}><div><p className={styles.eyebrow}>{alertsOpen ? "מרכז התראות" : "פעולה חדשה"}</p><h2>{alertsOpen ? "מה דורש ממך תשומת לב" : "איפה נתחיל?"}</h2></div><button aria-label="סגירה" onClick={() => { setAlertsOpen(false); setQuickOpen(false); }}><X size={21} /></button></div>{alertsOpen ? <div className={overlay.modalList}>{urgentActions.length ? urgentActions.map((action, index) => <Link href={action.href} key={`${action.company}-${index}`} className={overlay.modalItem} onClick={() => setAlertsOpen(false)}><Flag flag="amber" /><span><b>{action.text}</b><small>{action.company} · {action.detail}</small></span><ChevronLeft size={17} /></Link>) : <p className={overlay.empty}>אין כרגע התראות שממתינות לפעולה.</p>}</div> : <div className={overlay.quickGrid}>{companies.map(company => { const Icon = company.icon; return <Link href={`/companies/${company.slug}`} key={company.slug} className={overlay.quickItem} onClick={() => setQuickOpen(false)}><span className={`${overlay.quickIcon} ${overlay[company.tone]}`}><Icon size={19} /></span><span><b>{company.name}</b><small>הוספה או עדכון</small></span><ChevronLeft size={16} /></Link>; })}</div>}</section></div>}
    {jarvisChatOpen && <div className={overlay.overlay} onClick={() => setJarvisChatOpen(false)}><section className={`${overlay.modal} ${overlay.chatModal}`} onClick={event => event.stopPropagation()}><div className={overlay.modalTop}><div><p className={styles.eyebrow}>JARVIS</p><h2>שאל אותי משהו</h2></div><button aria-label="סגירה" onClick={() => setJarvisChatOpen(false)}><X size={21} /></button></div>
      <div className={overlay.chatLog}>
        {!chatMessages.length && <p className={overlay.empty}>שאל אותי על מה שקורה בחברות שלך — אני עונה על סמך הנתונים שיש לי כרגע.</p>}
        {chatMessages.map((message, index) => <p key={index} className={message.role === "user" ? overlay.chatBubbleUser : overlay.chatBubbleAi}>{message.text}</p>)}
        {chatSending && <p className={overlay.chatBubbleAi}>חושב…</p>}
      </div>
      {chatError && <p className={overlay.chatErrorText}>{chatError}</p>}
      <form className={overlay.chatForm} onSubmit={sendChatMessage}>
        <input className={overlay.chatInput} value={chatInput} onChange={event => setChatInput(event.target.value)} placeholder="מה שלום התקציב שלי החודש?" disabled={chatSending} />
        <button className={overlay.chatSend} type="submit" aria-label="שליחה" disabled={chatSending || !chatInput.trim()}><Send size={17} /></button>
      </form>
    </section></div>}
  </main>;
}
