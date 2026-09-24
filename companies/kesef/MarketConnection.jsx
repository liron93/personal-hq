"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import s from './market-connection.module.css';
import {
  STORE_KEY, STATUS, STATUS_LABEL, connectionStatus, buildSnapshot, markStale, clearStale, errorCategoryLabel,
} from './market-snapshot';
import PriceRangeChart from './PriceRangeChart';

async function call(method = 'GET', payload) {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('יש להתחבר לחשבון לפני בדיקת החיבור.');
  const response = await fetch('/api/market/eodhd', {
    method,
    credentials: 'same-origin',
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    cache: 'no-store',
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(value.error || 'בדיקת החיבור נכשלה.');
    err.category = value.category || 'unknown';
    throw err;
  }
  return value;
}

const fmtTime = iso => (iso ? new Date(iso).toLocaleString('he-IL') : 'לא זמין');
const numOrNA = v => (v == null ? 'לא זמין' : v.toLocaleString('en-US'));

function StatusBadge({ connStatus, verifiedAt }) {
  const cls = connStatus === STATUS.NEEDS_RENEWAL ? s.badgeWarn : connStatus === STATUS.VERIFIED ? s.badgeOk : s.badge;
  const suffix = connStatus === STATUS.VERIFIED && verifiedAt ? ` · ${fmtTime(verifiedAt)}` : '';
  return <span className={cls}>{STATUS_LABEL[connStatus]}{suffix}</span>;
}

export default function MarketConnection() {
  // צילום המצב האחרון שהתקבל בפועל מהספק: נשמר פר-משתמש דרך lib/store.js
  // (אותה שכבת אחסון שכל שאר האפליקציה משתמשת בה — ראו CLAUDE.md כלל 3).
  // לא מאותחל אוטומטית מהספק: רק load() מהאחסון הקיים, בלי קריאת EODHD.
  const { data: snapshot, setData: setSnapshot, status: snapshotStatus } = useStore(STORE_KEY, null);

  const [keyStatus, setKeyStatus] = useState(null); // {configured, storageReady} — בדיקת הגדרה בלבד, לא קריאת ספק
  const [error, setError] = useState('');
  const [errorCategory, setErrorCategory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');
  const [symbol, setSymbol] = useState('AAPL');

  async function checkConfig() {
    try { setKeyStatus(await call()); } catch { setKeyStatus(null); }
  }
  useEffect(() => { checkConfig(); }, []); // eslint-disable-line

  async function saveKey(e) {
    e.preventDefault(); setBusy(true); setError(''); setErrorCategory(null); setMessage('');
    try {
      setKeyStatus(await call('PUT', { key: apiKey }));
      // מפתח חדש = תיקון מפורש מהמשתמש; מנקים "נדרש חידוש" ישן, בלי לגעת בנתון עצמו.
      if (snapshot?.stale) setSnapshot(clearStale(snapshot));
      setMessage('המפתח נשמר מוצפן ל־30 יום בדפדפן הזה. עכשיו אפשר לבדוק את החיבור.');
    } catch (e) { setError(e.message); } finally { setApiKey(''); setBusy(false); }
  }

  async function removeKey() {
    if (!window.confirm('להסיר את המפתח מהדפדפן הזה? הפעולה אינה מבטלת אותו בחשבון EODHD.')) return;
    setBusy(true); setError(''); setErrorCategory(null); setMessage(''); setApiKey('');
    try { setKeyStatus(await call('DELETE')); setMessage('המפתח הוסר מהדפדפן הזה.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  // בדיקת חיבור / בדיקת מניה: פעולה מפורשת אחת של המשתמש → קריאה אמיתית אחת ל-EODHD.
  // אין רענון אוטומטי ואין polling.
  async function testConnection(e) {
    e.preventDefault(); setBusy(true); setError(''); setErrorCategory(null);
    try {
      const history = await call('POST', { symbol });
      setSnapshot(buildSnapshot(history));
    } catch (e) {
      setError(e.message); setErrorCategory(e.category || 'unknown');
      // כשל בבדיקה לא מוחק את הצילום הקודם — הוא נשאר על המסך, מסומן כמיושן.
      if (snapshot) setSnapshot(markStale(snapshot, { message: e.message, category: e.category, at: new Date().toISOString() }));
    } finally { setBusy(false); }
  }

  const connStatus = connectionStatus({ configured: !!keyStatus?.configured, snapshot });

  return (
    <section className={s.panel} dir="rtl">
      <header>
        <div>
          <p className={s.eyebrow}>US MARKET / EODHD</p>
          <h2>חיבור נתוני שוק</h2>
          <p>מחירי סוף יום והיסטוריה של עד שנה — מתוך האפליקציה.</p>
        </div>
        <StatusBadge connStatus={connStatus} verifiedAt={snapshot?.verifiedAt} />
      </header>

      <div className={s.notice}>המסלול החינמי מוגבל ל־20 קריאות ביום. טעינת סימול עשויה לצרוך קריאה גם אם לא נמצא. אין רענון אוטומטי או סריקת כל השוק. אין כאן המלצת קנייה/מכירה או ניתוח אוטומטי — רק תצוגת נתונים.</div>

      <section aria-labelledby="key-heading">
        <h3 id="key-heading">המפתח האישי שלך</h3>
        <p>פותחים חשבון ב־<a href="https://eodhd.com/register" target="_blank" rel="noreferrer">EODHD</a>, מעתיקים את מפתח ה־API ומדביקים כאן. לא צריך לשלוח אותו בצ׳אט. השדה שולח את המפתח לשרת של האפליקציה בלבד — הוא לעולם לא נשמר בקוד הדפדפן, ב-localStorage או בתיק האישי.</p>
        {keyStatus && !keyStatus.storageReady && <p role="status" className={s.notice}>השמירה המאובטחת עדיין ממתינה להפעלה בשרת. השדה ייפתח לאחר ההפעלה.</p>}
        <form onSubmit={saveKey}>
          <label htmlFor="eodhd-key">{keyStatus?.configured ? 'החלפת מפתח' : 'מפתח API'}
            <input id="eodhd-key" type="password" dir="ltr" autoComplete="off" spellCheck={false} value={apiKey}
              onChange={e => setApiKey(e.target.value)} minLength={8} maxLength={256} required
              disabled={busy || !keyStatus?.storageReady} placeholder="הדבק את המפתח כאן" aria-describedby="key-privacy" />
          </label>
          <button type="submit" disabled={busy || !keyStatus?.storageReady || !apiKey.trim()}>שמירת מפתח</button>
          {keyStatus?.configured && <button type="button" onClick={removeKey} disabled={busy}>הסרת מפתח</button>}
        </form>
        <p id="key-privacy">המפתח נשמר בעוגייה מוצפנת ל־30 יום, הקשורה לחשבון שלך ואינה נגישה לקוד הדפדפן. אין סנכרון בין מכשירים. מחיקת עוגיות תסיר את החיבור; להסרה מכל המכשירים יש לבטל את המפתח אצל EODHD. שמירת מפתח בלבד אינה בודקת את תקינותו — יש להריץ בדיקת חיבור למטה כדי לדעת אם הוא באמת עובד.</p>
        {message && <p role="status">{message}</p>}
      </section>

      <section aria-labelledby="test-heading">
        <h3 id="test-heading">בדיקת חיבור / בדיקת מניה</h3>
        <p>בוחרים סימול אמריקאי ולוחצים על הכפתור — זו קריאה אחת ומפורשת ל-EODHD, לא בדיקה אוטומטית.</p>
        <form onSubmit={testConnection}>
          <label>סימול אמריקאי
            {/* הפייטרן הישן ([A-Za-z0-9-] עם מקף בסוף המחלקה) לא תקין תחת מצב ה-regex
                החדש (unicode sets) שדפדפנים עדכניים מפעילים על attribute pattern —
                קונסולת הדפדפן זרקה עליו SyntaxError ובפועל אימות הצד-לקוח כובה בשקט. */}
            <input dir="ltr" value={symbol} maxLength={18} required pattern="[A-Za-z][A-Za-z0-9\-]{0,14}(\.US)?" onChange={e => setSymbol(e.target.value.toUpperCase())} />
          </label>
          <button disabled={busy || !keyStatus?.configured} type="submit">{busy ? 'בודק…' : 'בדיקת חיבור וטעינת שנה'}</button>
        </form>
        {!keyStatus?.configured && <p role="status">יש לשמור מפתח למעלה לפני שאפשר לבדוק חיבור.</p>}
        {error && (
          <p role="alert" className={s.error}>
            {errorCategory && <strong>{errorCategoryLabel(errorCategory)}: </strong>}
            {error}
          </p>
        )}
      </section>

      {snapshot ? (
        <section aria-label="נתוני השוק שהתקבלו">
          {snapshot.stale && (
            <div className={s.staleNotice} role="status">
              <strong>הנתונים מוצגים מיושנים.</strong> ניסיון הרענון האחרון נכשל ב-{fmtTime(snapshot.staleSince)}
              {snapshot.staleReason ? `: ${snapshot.staleReason}` : '.'} מוצג עדיין הצילום האחרון שאומת בהצלחה, מ-{fmtTime(snapshot.verifiedAt)}.
            </div>
          )}
          <p className={s.eodBadge}>סוף יום — לא בזמן אמת</p>
          <div className={s.metrics}>
            <article><span>סימול</span><strong dir="ltr">{snapshot.symbol ?? 'לא זמין'}</strong></article>
            <article><span>סגירה אחרונה, כפי שדווחה</span><strong>{numOrNA(snapshot.close)}</strong></article>
            <article><span>תאריך המסחר האחרון</span><strong dir="ltr">{snapshot.asOf ?? 'לא זמין'}</strong></article>
            <article>
              <span>שינוי מול הסגירה הקודמת</span>
              <strong>{snapshot.changeAbs == null ? 'לא זמין' : `${snapshot.changeAbs > 0 ? '+' : ''}${snapshot.changeAbs.toLocaleString('en-US')} (${snapshot.changePct > 0 ? '+' : ''}${snapshot.changePct}%)`}</strong>
            </article>
            <article><span>מחזור מסחר (יחידות)</span><strong>{numOrNA(snapshot.volume)}</strong></article>
            <article><span>סגירה מתואמת</span><strong>{numOrNA(snapshot.adjustedClose)}</strong></article>
          </div>
          <p>מקור: {snapshot.provider} · נשלף: {fmtTime(snapshot.fetchedAt)}</p>
          <p>נתונים מתוקנים מוצגים בנפרד מהסגירה הגולמית; אין כאן תחזית, ציון ביטחון או המלצת קנייה/מכירה.</p>
        </section>
      ) : (
        <p role="status">{busy ? 'בודק את החיבור…' : 'עדיין אין צילום מצב שמור. הרץ בדיקת חיבור כדי לראות נתונים.'}</p>
      )}

      <section aria-labelledby="research-heading">
        <h3 id="research-heading">מחקר (תיאורי בלבד)</h3>
        <p>גרף מחירי הסגירה היומיים מתוך אותה שליפה — לצורך תיאור בלבד, לא ניתוח וללא המלצה. מקור הנתונים: <a href="https://eodhd.com/financial-apis/api-for-historical-data-and-volumes" target="_blank" rel="noreferrer">EODHD — End-of-Day Historical Data API</a>.</p>
        {snapshot?.bars?.length ? <PriceRangeChart bars={snapshot.bars} /> : <p role="status">אין עדיין נתוני טווח להצגה — הרץ בדיקת חיבור כדי לטעון גרף.</p>}
      </section>

      <p className={s.footnote}>הצילום האחרון נשמר בחשבון שלך (לא בדפדפן בלבד) ומוצג גם בביקור הבא, בלי קריאה נוספת לספק. לעולם לא נטען אוטומטית מהספק בטעינת הדף — רק לחיצה מפורשת על "בדיקת חיבור" קוראת ל-EODHD.{snapshotStatus === 'error' && ' (טעינת הצילום השמור נכשלה כרגע — מוצג מצב ריק.)'}</p>
      <p className={s.footnote}>המטמון והגנת 15 הקריאות בשרת הם מקומיים למופע ונמחקים באתחול; אינם מונה המכסה הכולל. המכסה הקובעת נמצאת בחשבון EODHD.</p>
    </section>
  );
}
