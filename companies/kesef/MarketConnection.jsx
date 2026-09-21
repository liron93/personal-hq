"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import s from './market-connection.module.css';

async function call(method='GET',payload) {
  const {data}=await supabase.auth.getSession();
  if(!data.session?.access_token)throw new Error('יש להתחבר לחשבון לפני בדיקת החיבור.');
  const response=await fetch('/api/market/eodhd',{method,credentials:'same-origin',headers:{Authorization:`Bearer ${data.session.access_token}`,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),cache:'no-store'});
  const value=await response.json();if(!response.ok)throw new Error(value.error||'בדיקת החיבור נכשלה.');return value;
}
export default function MarketConnection() {
  const [status,setStatus]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[symbol,setSymbol]=useState('AAPL'),[result,setResult]=useState(null);
  const [apiKey,setApiKey]=useState(''),[message,setMessage]=useState('');
  async function saveKey(e){e.preventDefault();setBusy(true);setError('');setMessage('');setResult(null);try{setStatus(await call('PUT',{key:apiKey}));setMessage('המפתח נשמר מוצפן ל־30 יום בדפדפן הזה. עכשיו אפשר לבדוק את החיבור.');}catch(e){setError(e.message);}finally{setApiKey('');setBusy(false);}}
  async function removeKey(){if(!window.confirm('להסיר את המפתח מהדפדפן הזה? הפעולה אינה מבטלת אותו בחשבון EODHD.'))return;setBusy(true);setError('');setMessage('');setResult(null);setApiKey('');try{setStatus(await call('DELETE'));setMessage('המפתח הוסר מהדפדפן הזה.');}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function check(){setBusy(true);setError('');try{setStatus(await call());}catch(e){setStatus(null);setError(e.message);}finally{setBusy(false);}}
  useEffect(()=>{check();},[]);
  async function connect(e){e.preventDefault();setBusy(true);setError('');setResult(null);try{setResult(await call('POST',{symbol}));}catch(e){setError(e.message);}finally{setBusy(false);}}
  const latest=result?.bars.at(-1);
  return <section className={s.panel} dir="rtl"><header><div><p className={s.eyebrow}>US MARKET / EODHD</p><h2>חיבור נתוני שוק</h2><p>מחירי סוף יום והיסטוריה של עד שנה — מתוך האפליקציה.</p></div><span className={s.badge}>{result?'התקבלו נתונים מהספק':status?.configured?'מוגדר · טרם אומת':busy?'בודק…':'החיבור אינו מוכן'}</span></header>
    <div className={s.notice}>המסלול החינמי מוגבל ל־20 קריאות ביום. טעינת סימול עשויה לצרוך קריאה גם אם לא נמצא. אין רענון אוטומטי או סריקת כל השוק.</div>
    <section aria-labelledby="key-heading"><h3 id="key-heading">המפתח האישי שלך</h3><p>פותחים חשבון ב־<a href="https://eodhd.com/register" target="_blank" rel="noreferrer">EODHD</a>, מעתיקים את מפתח ה־API ומדביקים כאן. לא צריך לשלוח אותו בצ׳אט.</p>
    {status&&!status.storageReady&&<p role="status" className={s.notice}>השמירה המאובטחת עדיין ממתינה להפעלה בשרת. השדה ייפתח לאחר ההפעלה.</p>}
    <form onSubmit={saveKey}><label htmlFor="eodhd-key">{status?.configured?'החלפת מפתח':'מפתח API'}<input id="eodhd-key" type="password" dir="ltr" autoComplete="off" spellCheck={false} value={apiKey} onChange={e=>setApiKey(e.target.value)} minLength={8} maxLength={256} required disabled={busy||!status?.storageReady} placeholder="הדבק את המפתח כאן" aria-describedby="key-privacy"/></label><button type="submit" disabled={busy||!status?.storageReady||!apiKey.trim()}>שמירת מפתח</button>{status?.configured&&<button type="button" onClick={removeKey} disabled={busy}>הסרת מפתח</button>}</form>
    <p id="key-privacy">המפתח נשמר בעוגייה מוצפנת ל־30 יום, הקשורה לחשבון שלך ואינה נגישה לקוד הדפדפן. אין סנכרון בין מכשירים. מחיקת עוגיות תסיר את החיבור; להסרה מכל המכשירים יש לבטל את המפתח אצל EODHD. השמירה אינה בודקת את תקינות המפתח אצל הספק.</p>{message&&<p role="status">{message}</p>}</section>
    <button onClick={check} disabled={busy}>בדיקת הגדרות — ללא קריאת EODHD</button>
    <form onSubmit={connect}><label>סימול אמריקאי<input dir="ltr" value={symbol} maxLength={18} required pattern="[A-Za-z][A-Za-z0-9-]{0,14}(\.US)?" onChange={e=>setSymbol(e.target.value.toUpperCase())}/></label><button disabled={busy||!status?.configured} type="submit">{busy?'טוען…':'בדיקת חיבור וטעינת שנה'}</button></form>
    {error&&<p role="alert" className={s.error}>{error}</p>}
    {!result&&!error&&<p role="status">{busy?'בודק את החיבור…':'בחר סימול וטען נתונים. לא נטענים נתוני דוגמה.'}</p>}
    {result&&<section aria-label="נתוני השוק שהתקבלו"><div className={s.metrics}><article><span>סימול</span><strong dir="ltr">{result.symbol}</strong></article><article><span>סגירה אחרונה, כפי שדווחה</span><strong>{latest.close.toLocaleString('en-US')}</strong></article><article><span>תאריך המסחר האחרון</span><strong dir="ltr">{result.asOf}</strong></article></div><p>מקור: EODHD · נשלף: {new Date(result.fetchedAt).toLocaleString('he-IL')} · {result.cached?'תוצאה שמורה בשרת':'שליפה חדשה'} · {result.bars.length} ימי מסחר.</p><p>זהו מחיר סוף יום, לא מחיר בזמן אמת. נתונים מתוקנים מוצגים בנפרד; אין כאן תחזית עלייה או ניתוח דוחות/FDA.</p><div className={s.table}><table><caption>עשרת ימי המסחר האחרונים</caption><thead><tr><th>תאריך</th><th>סגירה</th><th>סגירה מתואמת</th><th>מחזור יחידות</th></tr></thead><tbody>{result.bars.slice(-10).reverse().map(b=><tr key={b.date}><td><bdi>{b.date}</bdi></td><td>{b.close}</td><td>{b.adjustedClose??'חסר'}</td><td>{b.volume.toLocaleString('en-US')}</td></tr>)}</tbody></table></div></section>}
    <p className={s.footnote}>המטמון והגנת 15 הקריאות בשרת הם מקומיים למופע ונמחקים באתחול; אינם מונה המכסה הכולל. המכסה הקובעת נמצאת בחשבון EODHD. הנתונים אינם נשמרים בתיק האישי.</p>
  </section>;
}
