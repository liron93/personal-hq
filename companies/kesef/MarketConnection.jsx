"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import s from './market-connection.module.css';

async function call(method='GET',symbol) {
  const {data}=await supabase.auth.getSession();
  if(!data.session?.access_token)throw new Error('יש להתחבר לחשבון לפני בדיקת החיבור.');
  const response=await fetch('/api/market/eodhd',{method,headers:{Authorization:`Bearer ${data.session.access_token}`,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify({symbol})}:{}),cache:'no-store'});
  const value=await response.json();if(!response.ok)throw new Error(value.error||'בדיקת החיבור נכשלה.');return value;
}
export default function MarketConnection() {
  const [status,setStatus]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[symbol,setSymbol]=useState('AAPL'),[result,setResult]=useState(null);
  async function check(){setBusy(true);setError('');try{setStatus(await call());}catch(e){setStatus(null);setError(e.message);}finally{setBusy(false);}}
  useEffect(()=>{check();},[]);
  async function connect(e){e.preventDefault();setBusy(true);setError('');setResult(null);try{setResult(await call('POST',symbol));}catch(e){setError(e.message);}finally{setBusy(false);}}
  const latest=result?.bars.at(-1);
  return <section className={s.panel} dir="rtl"><header><div><p className={s.eyebrow}>US MARKET / EODHD</p><h2>חיבור נתוני שוק</h2><p>מחירי סוף יום והיסטוריה של עד שנה — מתוך האפליקציה.</p></div><span className={s.badge}>{result?'התקבלו נתונים מהספק':status?.configured?'מוגדר · טרם אומת':busy?'בודק…':'החיבור אינו מוכן'}</span></header>
    <div className={s.notice}>המסלול החינמי מוגבל ל־20 קריאות ביום. טעינת סימול עשויה לצרוך קריאה גם אם לא נמצא. אין רענון אוטומטי או סריקת כל השוק.</div>
    <details open={!status?.configured}><summary>איך מפעילים את החיבור?</summary><ol><li>פותחים חשבון חינמי ב־<a href="https://eodhd.com/register" target="_blank" rel="noreferrer">EODHD</a>.</li><li>מגדירים במשתני השרת <code>EODHD_API_KEY</code> ואת מזהה המשתמש המורשה ב־<code>EODHD_ALLOWED_USER_IDS</code>.</li><li>פורסים מחדש ולוחצים “בדיקת הגדרות”. רק קבלת נתונים מאמתת את המפתח בפועל.</li></ol><p>אין להדביק מפתח בצ׳אט, בגיטהאב או ברשימת המעקב. לא נדרש חיבור לחשבון מסחר.</p></details>
    <button onClick={check} disabled={busy}>בדיקת הגדרות — ללא קריאת EODHD</button>
    <form onSubmit={connect}><label>סימול אמריקאי<input dir="ltr" value={symbol} maxLength={18} required pattern="[A-Za-z][A-Za-z0-9-]{0,14}(\.US)?" onChange={e=>setSymbol(e.target.value.toUpperCase())}/></label><button disabled={busy||!status?.configured} type="submit">{busy?'טוען…':'בדיקת חיבור וטעינת שנה'}</button></form>
    {error&&<p role="alert" className={s.error}>{error}</p>}
    {!result&&!error&&<p role="status">{busy?'בודק את החיבור…':'בחר סימול וטען נתונים. לא נטענים נתוני דוגמה.'}</p>}
    {result&&<section aria-label="נתוני השוק שהתקבלו"><div className={s.metrics}><article><span>סימול</span><strong dir="ltr">{result.symbol}</strong></article><article><span>סגירה אחרונה, כפי שדווחה</span><strong>{latest.close.toLocaleString('en-US')}</strong></article><article><span>תאריך המסחר האחרון</span><strong dir="ltr">{result.asOf}</strong></article></div><p>מקור: EODHD · נשלף: {new Date(result.fetchedAt).toLocaleString('he-IL')} · {result.cached?'תוצאה שמורה בשרת':'שליפה חדשה'} · {result.bars.length} ימי מסחר.</p><p>זהו מחיר סוף יום, לא מחיר בזמן אמת. נתונים מתוקנים מוצגים בנפרד; אין כאן תחזית עלייה או ניתוח דוחות/FDA.</p><div className={s.table}><table><caption>עשרת ימי המסחר האחרונים</caption><thead><tr><th>תאריך</th><th>סגירה</th><th>סגירה מתואמת</th><th>מחזור יחידות</th></tr></thead><tbody>{result.bars.slice(-10).reverse().map(b=><tr key={b.date}><td><bdi>{b.date}</bdi></td><td>{b.close}</td><td>{b.adjustedClose??'חסר'}</td><td>{b.volume.toLocaleString('en-US')}</td></tr>)}</tbody></table></div></section>}
    <p className={s.footnote}>המטמון והגנת 15 הקריאות בשרת הם מקומיים למופע ונמחקים באתחול; אינם מונה המכסה הכולל. המכסה הקובעת נמצאת בחשבון EODHD. הנתונים אינם נשמרים בתיק האישי.</p>
  </section>;
}
