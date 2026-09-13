"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpLeft, BellRing, BriefcaseBusiness, Building2, ChevronLeft, CircleAlert, CircleCheck, Dumbbell, HeartPulse, Home, Landmark, MoreHorizontal, Plus, Sparkles, WalletCards } from "lucide-react";
import { COMPANIES } from "@/companies/registry";
import { load, useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import * as coreFacts from "@/lib/coreFacts";
import styles from "./home.module.css";

function useSummaries() {
  const [summaries, setSummaries] = useState({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const next = {};
      for (const company of COMPANIES) {
        try { next[company.slug] = company.summarize((await load(company.storeKey)) ?? company.init); }
        catch { next[company.slug] = company.summarize(company.init); }
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
};
const money = value => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(value || 0);
function Flag({ flag }) { return <span className={`${styles.dot} ${flag === "amber" ? styles.dotAmber : flag === "green" ? styles.dotGreen : styles.dotNeutral}`} />; }

export default function CEO() {
  const summaries = useSummaries();
  const { data: core, upd: coreUpd, ready: coreReady } = useStore(coreFacts.STORE_KEY, coreFacts.INIT);
  const [menuOpen, setMenuOpen] = useState(false);
  const today = new Date();
  const greeting = today.getHours() < 12 ? "בוקר טוב, לירון" : today.getHours() < 18 ? "צהריים טובים, לירון" : "ערב טוב, לירון";
  const companies = useMemo(() => COMPANIES.map(c => ({ ...c, summary: summaries[c.slug], ...meta[c.slug] })), [summaries]);
  const openTasks = companies.reduce((sum, c) => sum + (c.summary?.openTasks || 0), 0);
  const attention = companies.filter(c => c.summary?.flag === "amber");
  const career = summaries.avoda, home = summaries["beit-hadash"]?.renovation, finance = summaries.kesef, health = summaries.health;
  const latest = companies.filter(c => c.summary?.latestUpdate).sort((a, b) => new Date(b.summary.latestUpdate.date) - new Date(a.summary.latestUpdate.date))[0];
  const income = Number(core?.mySalary || 0) + Number(core?.wifeSalary || 0);
  const dateLabel = today.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });

  return <main className={styles.page}>
    <div className={styles.aurora} aria-hidden="true" />
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/"><span className={styles.brandMark}><Building2 size={19} /></span><span>PERSONAL <b>HQ</b></span></Link>
      <div className={styles.headerActions}><button className={styles.iconButton} aria-label="התראות"><BellRing size={19} /><i className={styles.notification} /></button><button className={styles.avatar} aria-label="תפריט חשבון" onClick={() => setMenuOpen(v => !v)}>ל</button>{menuOpen && <div className={styles.accountMenu}><button onClick={() => supabase.auth.signOut()}>יציאה מאובטחת</button></div>}</div>
    </header>
    <section className={styles.hero}><div><p className={styles.date}>{dateLabel}</p><h1>{greeting}<span className={styles.wave}>✦</span></h1><p className={styles.heroCopy}>הכול במקום אחד. בוא נסדר את הדבר הבא שיקדם אותך היום.</p></div><div className={styles.heroActions}><Link href="/companies/beit-hadash" className={styles.primaryAction}><Plus size={18} /> עדכון חדש</Link><a href="#companies" className={styles.secondaryAction}>לכל החברות <ArrowLeft size={17} /></a></div></section>
    <section className={styles.command}><div className={styles.commandIntro}><span className={styles.commandIcon}><Sparkles size={20} /></span><div><p>מרכז השליטה</p><strong>{attention.length ? `${attention.length} נושאים מחכים לתשומת לב` : "המערכת בשליטה. ממשיכים בתנופה."}</strong></div></div><div className={styles.commandStats}><div><b>{openTasks}</b><span>פעולות פתוחות</span></div><div><b>{career?.activeJobs || 0}</b><span>משרות פעילות</span></div><div><b>{home?.urgent || 0}</b><span>נושאי בית דחופים</span></div></div></section>
    <section className={styles.gridTop}><article className={`${styles.card} ${styles.nextCard}`}><div className={styles.cardTop}><div><p className={styles.eyebrow}>הדבר הבא</p><h2>{attention[0] ? `בדיקה מול ${attention[0].name}` : "סקירה יומית קצרה"}</h2></div><span className={styles.pulse}><span /></span></div>{career?.nextStep ? <p className={styles.nextDescription}>{career.nextStep.company}: {career.nextStep.text}</p> : <p className={styles.nextDescription}>פתח את החברה שהכי חשובה היום ובחר פעולה אחת קטנה לקידום.</p>}<Link href={attention[0] ? `/companies/${attention[0].slug}` : "/companies/beit-hadash"} className={styles.inlineLink}>לטיפול עכשיו <ArrowLeft size={16} /></Link></article><article className={`${styles.card} ${styles.moneyCard}`}><div className={styles.cardTop}><div><p className={styles.eyebrow}>תמונת כסף</p><h2>החודש שלך</h2></div><Landmark size={21} /></div><div className={styles.moneyRow}><span>הכנסה חודשית</span><strong>{money(income)}</strong></div><div className={styles.moneyRow}><span>משכנתא</span><strong>{money(core?.mortgageMonthly)}</strong></div><Link href="/companies/kesef" className={styles.inlineLink}>למרכז הכספים <ArrowLeft size={16} /></Link></article></section>
    <section className={styles.sectionHeader} id="companies"><div><p className={styles.eyebrow}>החברות שלי</p><h2>מה קורה בכל תחום</h2></div><span>{companies.length} פעילות</span></section>
    <section className={styles.companyGrid}>{companies.map(c => { const Icon = c.icon; const metric = c.slug === "beit-hadash" ? `${money(home?.paid)} שולם` : c.slug === "kesef" ? money(finance?.netWorth) : c.slug === "health" ? `${health?.weekWorkouts || 0} אימונים השבוע` : c.slug === "avoda" ? `${career?.activeJobs || 0} משרות פעילות` : `${c.summary?.openTasks || 0} נושאים פתוחים`; return <Link href={`/companies/${c.slug}`} key={c.slug} className={`${styles.companyCard} ${styles[c.tone]}`}><div className={styles.companyCardTop}><span className={styles.companyIcon}><Icon size={21} /></span><MoreHorizontal size={20} className={styles.more} /></div><div><h3>{c.name}</h3><p>מנכ״ל: {c.manager}</p></div><div className={styles.companyFoot}><div><strong>{metric}</strong><span><Flag flag={c.summary?.flag} /> {c.summary?.flag === "amber" ? "דורש תשומת לב" : "במסלול"}</span></div><span className={styles.cardArrow}><ChevronLeft size={19} /></span></div></Link>; })}</section>
    <section className={styles.gridBottom}><article className={styles.card}><div className={styles.cardTop}><div><p className={styles.eyebrow}>התקדמות בית חדש</p><h2>תקציב השיפוץ</h2></div><Home size={20} /></div><div className={styles.progressMeta}><strong>{money(home?.paid)}</strong><span>מתוך {money(home?.planned)}</span></div><div className={styles.progressTrack}><span style={{ width: `${Math.min(100, Math.round(((home?.paid || 0) / (home?.planned || 1)) * 100))}%` }} /></div><p className={styles.helper}>{home?.urgent || 0} פריטים שצריך לסגור לפני המעבר</p><Link href="/companies/beit-hadash" className={styles.inlineLink}>לניהול השיפוץ <ArrowLeft size={16} /></Link></article><article className={styles.card}><div className={styles.cardTop}><div><p className={styles.eyebrow}>קצב אישי</p><h2>אימון ותזונה</h2></div><Dumbbell size={20} /></div><div className={styles.healthKpis}><div><b>{health?.weekWorkouts || 0}</b><span>אימונים</span></div><div><b>{health?.weekMeals || 0}</b><span>דיווחי תזונה</span></div><div><b>{health?.profile?.goal || "—"}</b><span>מטרה</span></div></div><Link href="/companies/health" className={styles.inlineLink}>לעדכון היום <ArrowLeft size={16} /></Link></article><article className={`${styles.card} ${styles.feedCard}`}><div className={styles.cardTop}><div><p className={styles.eyebrow}>עדכון אחרון</p><h2>מה השתנה</h2></div><CircleCheck size={20} /></div>{latest ? <><p className={styles.feedText}>{latest.summary.latestUpdate.text}</p><Link href={`/companies/${latest.slug}`} className={styles.inlineLink}>ל{latest.name} <ArrowLeft size={16} /></Link></> : <p className={styles.feedText}>ברגע שתעדכן חברה, ההתקדמות תופיע כאן.</p>}</article></section>
    {coreReady && <section className={styles.coreStrip}><div><CircleAlert size={18} /><span>נתוני ליבה ניתנים לעריכה מהירה כאן</span></div><label>הכנסה שלך<input value={core.mySalary || ""} inputMode="numeric" onChange={e => coreUpd("mySalary", Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} /></label><label>הכנסת בת הזוג<input value={core.wifeSalary || ""} inputMode="numeric" onChange={e => coreUpd("wifeSalary", Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} /></label></section>}
    <footer className={styles.footer}>Personal HQ <span /> שליטה שקטה בחיים שלך <ArrowUpLeft size={14} /></footer>
  </main>;
}
