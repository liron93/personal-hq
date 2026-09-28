"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStore, load } from '@/lib/store';
import * as core from '@/lib/coreFacts';
import { INIT, STORE_KEY, capacity, condition, portfolio } from './model.mjs';
import { disconnectedAdapter } from './adapter.mjs';
import s from './investments.module.css';

const tabs = [['overview','מרכז שליטה'],['holdings','התיק שלי'],['watchlist','רשימת מעקב'],['goals','מטרות'],['api','חיבור נתונים']];
const money = (v,c='ILS') => new Intl.NumberFormat('he-IL',{style:'currency',currency:c,maximumFractionDigits:2}).format(v);
const statusText = { unknown:'אין מחיר עדכני לבדיקה',waiting:'התנאי טרם התקיים',entry:'תנאי הכניסה שהגדרת התקיים',exit:'תנאי היציאה שהגדרת התקיים' };
const newRow = { symbol:'',currency:'USD',units:'',sector:'',thesis:'',entryBelow:'',exitAbove:'',title:'',target:'',date:'' };
export default function Company() {
  const store = useStore(STORE_KEY,INIT);
  const [tab,setTab] = useState('overview'), [form,setForm] = useState(null), [error,setError] = useState('');
  const [funds,setFunds] = useState(null), [snapshot,setSnapshot] = useState({quotes:{},status:'disconnected'});
  useEffect(()=> { let active=true; load(core.STORE_KEY).then(v=>{if(active)setFunds(v?.investmentCapacity);}); disconnectedAdapter.snapshot().then(v=>{if(active)setSnapshot(v);}); return ()=>{active=false;}; },[]);
  if (!store.ready) return <p role="status">טוען את מרכז ההשקעות…</p>;
  const d={...INIT,...store.data}, cap=capacity(funds), totals=portfolio(d.holdings,snapshot.quotes);
  const changeTab = id => {setTab(id);setForm(null);setError('');};
  function save(e) {
    e.preventDefault(); setError('');
    const row={...form};
    if(tab==='goals') { row.target=Number(row.target); if(!(row.target>0)) return setError('יש להזין יעד חיובי'); }
    else {
      row.symbol=row.symbol.trim().toUpperCase();
      if(!/^[A-Z0-9.^:=_-]{1,30}$/.test(row.symbol)) return setError('יש להזין סימול תקין באנגלית');
      for(const key of ['entryBelow','exitAbove']) {row[key]=row[key]===''?null:Number(row[key]);if(row[key]!==null&&!(row[key]>0))return setError('מחירי התנאים חייבים להיות חיוביים');}
      if(row.entryBelow!==null&&row.exitAbove!==null&&row.entryBelow>=row.exitAbove)return setError('תנאי היציאה חייב להיות גבוה מתנאי הכניסה');
      if(tab==='holdings') {row.units=Number(row.units);if(!(row.units>0))return setError('הכמות חייבת להיות חיובית');}
    }
    row.id=row.id||crypto.randomUUID();
    store.setData(prev=>({...prev,[tab]:(prev[tab]||[]).some(x=>x.id===row.id)?prev[tab].map(x=>x.id===row.id?row:x):[...(prev[tab]||[]),row]})); setForm(null);
  }
  const field=(key,label,type='text')=><label key={key}>{label}<input required={['symbol','units','title','target'].includes(key)} type={type} step={type==='number'?'any':undefined} min={type==='number'?0:undefined} dir={type==='number'||key==='symbol'?'ltr':undefined} value={form[key]??''} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>;
  return <div className={s.shell} dir="rtl">
    <aside className={s.sidebar}><p className={s.brand}>OFΕK / INVESTMENTS</p><h2>מחשבה לפני פעולה.</h2><nav aria-label="מחלקות השקעות">{tabs.map(([id,title])=><button aria-current={tab===id?'page':undefined} className={tab===id?s.selected:''} key={id} onClick={()=>changeTab(id)}>{title}</button>)}</nav><p>קריאה ותכנון בלבד<br/>ללא הוראות מסחר</p></aside>
    <div className={s.content}><header className={s.header}><div><p className={s.eyebrow}>מרכז הבקרה של אופק</p><h2>{tabs.find(t=>t[0]===tab)[1]}</h2></div><span className={s.badge}>API טרם חובר</span></header>
    <p className={s.sync} role="status">{({synced:'נשמר בענן',syncing:'מסנכרן…',local:'שמירה מקומית בלבד','sync-error':'הסנכרון נכשל — נסה שוב'})[store.sync]||'טוען מצב שמירה'} {store.sync==='sync-error'&&<button onClick={store.retrySync}>ניסיון חוזר</button>}</p>
    {tab==='overview'&&<><section className={s.hero}><div><p className={s.eyebrow}>מרחב ההחלטה שלך</p><h3>לראות את התמונה.<br/>להבין את הסיכון.</h3><p>התיק הקיים, המטרות והכסף הפנוי — כל אחד במקומו. אין כאן המלצה לקנות או למכור.</p><button onClick={()=>changeTab('holdings')}>לניהול התיק ←</button></div><div className={s.orbit} aria-hidden="true"><span>OFΕK</span></div></section>
    <div className={s.metrics}><article><small>כסף זמין מאושר משבתאי</small><strong>{cap.amount===null?'ממתין לאישור':money(cap.amount)}</strong><Link href="/companies/kesef">לבדיקת תזרים והתחייבויות ←</Link></article><article><small>אחזקות שתיעדת</small><strong>{d.holdings.length}</strong><span>הזנה ידנית · לא חיבור לברוקר</span></article><article><small>ניירות ברשימת המעקב</small><strong>{d.watchlist.length}</strong><span>התנאים נבדקים רק מול מחיר עדכני</span></article></div>
    <div className={s.columns}><section className={s.panel}><h3>תמונת תיק ופיזור</h3>{Object.entries(totals.groups).map(([currency,value])=><p key={currency}>{money(value,currency)}</p>)}<p>{totals.missing?'לחלק מהאחזקות חסר מחיר עדכני. הסיכומים חלקיים.':'עד לחיבור מחירים לא יוצג שווי תיק מחושב.'}</p><p>מטבעות שונים אינם מחוברים לסכום אחד ללא שער המרה.</p>{Object.entries(totals.sectors).map(([key,value])=>{const currency=key.split(':')[0],pct=value/totals.groups[currency]*100;return <div key={key}><span>{key} · {pct.toFixed(1)}%</span><meter min="0" max="100" value={pct}/>{pct>d.concentrationLimit&&<p>מעל מגבלת הריכוז שהגדרת</p>}</div>;})}<label>מגבלת ריכוז לענף, בתוך כל מטבע (%)<input type="number" min="1" max="100" value={d.concentrationLimit} onChange={e=>{const v=Number(e.target.value);if(v>=1&&v<=100)store.upd('concentrationLimit',v);}}/></label></section><section className={s.panel}><h3>התראות תנאי</h3><p>בדיקה בעת טעינת נתונים בלבד, לא ניטור ברקע ולא הודעות דחיפה.</p>{!d.watchlist.length&&<p>הוסף נייר למעקב והגדר את התנאים שלך.</p>}{d.watchlist.map(x=><div className={s.condition} key={x.id}><b dir="ltr">{x.symbol}</b><span>{statusText[condition(x,snapshot.quotes[x.symbol])]}</span></div>)}<button onClick={()=>changeTab('watchlist')}>לרשימת המעקב ←</button></section></div></>}
    {['holdings','watchlist','goals'].includes(tab)&&<section className={s.panel}><div className={s.header}><p>{tab==='goals'?'מה הכסף אמור לאפשר לך, ובאיזה טווח זמן?':'נתונים שהזנת בעצמך. מחירים יגיעו מהחיבור העתידי.'}</p><button onClick={()=>{setForm({...newRow});setError('');}}>+ הוספה</button></div>
    {form&&<form className={s.form} onSubmit={save}><h3>{form.id?'עריכה':'פריט חדש'}</h3>{tab==='goals'?<>{field('title','שם המטרה')}{field('target','יעד כספי בש״ח','number')}{field('date','תאריך יעד','date')}</>:<>{field('symbol','סימול כולל בורסה במידת הצורך')}<label>מטבע<select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{['USD','ILS','EUR','GBP'].map(c=><option key={c}>{c}</option>)}</select></label>{tab==='holdings'&&field('units','כמות יחידות','number')}{field('sector','ענף / סקטור')}{field('entryBelow','תנאי כניסה: מחיר שווה או נמוך מ־','number')}{field('exitAbove','תנאי יציאה: מחיר שווה או גבוה מ־','number')}</>}<label>תזה, נימוקים וסיכונים<textarea value={form.thesis} onChange={e=>setForm({...form,thesis:e.target.value})}/></label>{error&&<p role="alert">{error}</p>}<div className={s.actions}><button type="submit">שמירה</button><button type="button" onClick={()=>setForm(null)}>ביטול וחזרה</button></div></form>}
    {!d[tab].length&&!form&&<div className={s.empty}><h3>מתחילים מתמונה אמיתית</h3><p>אין עדיין נתונים. הוסף את הפריט הראשון — לא נטען עבורך תיק לדוגמה.</p></div>}
    <div className={s.rows}>{d[tab].map(row=><article className={s.row} key={row.id}><div><h3>{row.title||<b dir="ltr">{row.symbol}</b>}</h3><p>{tab==='goals'?money(row.target):`${row.currency} · ${row.sector||'לא סווג'}${tab==='holdings'?` · ${row.units} יחידות`:''}`}</p><p>{row.thesis||'טרם נכתבה תזה'}</p>{tab!=='goals'&&<small>{statusText[condition(row,snapshot.quotes[row.symbol])]}</small>}{row.date&&<p>יעד: <bdi>{row.date}</bdi></p>}</div><div className={s.actions}><button onClick={()=>{setForm({...newRow,...row});setError('');}}>עריכה</button><button onClick={()=>{if(window.confirm('למחוק את הפריט? לא ניתן לבטל מחיקה.'))store.setData(prev=>({...prev,[tab]:prev[tab].filter(x=>x.id!==row.id)}));}}>מחיקה</button></div></article>)}</div></section>}
    {tab==='api'&&<section className={s.panel}><h3>מוכנים לממשק. לא מחוברים לחשבון.</h3><p>נבנה מתאם נתונים לקריאה בלבד עם אימות תשובות. חיבור אמיתי דורש ספק והרשאות, ולא הופעל כאן.</p><ul><li>תיק: מזהה חשבון ונייר ייחודי, בורסה, יחידות ומטבע.</li><li>מחירים: מחיר, מטבע, זמן ציטוט, מקור והשהיית מסחר.</li><li>המרה: שערי מטבע וזמן עדכון — לפני הצגת שווי כולל.</li><li>כספים: סכום מאושר משבתאי, תוקף האישור ופערי מידע.</li><li>אבטחה: הרשאת קריאה בלבד, מפתחות בשרת ובידוד לפי המשתמש.</li></ul><p>אין צורך בהרשאות מסחר, משיכה או העברת כספים. אין להזין כאן סיסמה או מפתח API.</p><button onClick={()=>changeTab('overview')}>חזרה למרכז השליטה</button></section>}
    <footer className={s.footer}>כלי לארגון מידע ותנאים אישיים, לא ייעוץ השקעות. מידע חסר אינו אפס.</footer></div>
  </div>;
}
