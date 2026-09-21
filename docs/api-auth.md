# אימות והרשאה ל-API routes

כל route תחת `app/api/` שמחזיר מידע אישי, הקשר JARVIS, נתוני כספים או נתוני שוק דורש משתמש מחובר שאומת **בשרת**.
ה-`AuthGate` בדפדפן רק מסתיר ממשק; האכיפה האמיתית היא ב-`lib/server-auth.mjs`. אין בקובץ הזה ערכים אמיתיים, רק שמות משתנים.

## איך זה עובד

1. הלקוח שולח `Authorization: Bearer <access token של סשן Supabase>` (`lib/api-client.mjs`).
2. השרת מאמת את הטוקן מול Supabase Auth (`auth.getUser`, לא פענוח מקומי בלבד). משתמש אנונימי נדחה.
3. הרשאה: כל משתמש מאומת מותר, **אלא אם** הוגדר `API_ALLOWED_USER_IDS` (מזהי משתמש UUID מופרדים בפסיקים), ואז רק הם. רשימה שהוגדרה אך אינה תקינה נכשלת סגור (הכול 403).
4. הגבלת קצב לכל משתמש ולכל route (חלון של דקה).
5. רק אחרי כל אלה: קריאת גוף (עם תקרת גודל), ולידציה, מפתחות צד שלישי ופנייה לספק, עם timeout.

תשובות כשל גנריות בעברית, בלי stack, בלי טקסט מהספק ובלי שמות משתנים: `401` לא מחובר/טוקן לא תקין או פג, `403` לא מורשה, `429` קצב, `413` גוף גדול, `400` קלט לא תקין, `503` שירות/אימות לא מוגדר. כל התשובות `Cache-Control: private, no-store`. ביומן נרשמים רק קודים קצרים (למשל `[api] quote upstream_500`).

## Routes

| Route | שיטה | דרישות | קצב לדקה | תקרת גוף |
|---|---|---|---|---|
| `/api/jarvis` | POST | משתמש מאומת ומורשה, `GEMINI_API_KEY` | 12 | 32KB |
| `/api/jarvis/chat` | POST | כנ"ל | 20 | 64KB |
| `/api/quote` | GET | משתמש מאומת ומורשה, `FINNHUB_API_KEY` (חסר = 503 גנרי) | 40 | ללא גוף |
| `/api/market/eodhd` | GET/POST/PUT/DELETE | משתמש מאומת ומורשה **וגם** ב-`EODHD_ALLOWED_USER_IDS` (נכשל סגור), `EODHD_COOKIE_SECRET` | 30 | 1KB |

מגבלות קלט JARVIS: הודעה עד 2000 תווים, עד 12 הודעות אחרונות נשלחות (עד 50 מתקבלות), הקשר עד 24KB (בתדריך: כל חלק עד 6KB). הודעה אחרונה חייבת להיות של המשתמש.
timeouts: Gemini 9 שניות לניסיון (נשמר ניסיון חוזר אחד על 503/שגיאת רשת), Finnhub 8 שניות. מפתח Finnhub נשלח בכותרת ולא ב-URL.

## משתני סביבה (שמות בלבד, בשרת בלבד)

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: נדרשים לאימות. בלעדיהם ה-routes מחזירים 503 (נכשל סגור).
- `API_ALLOWED_USER_IDS`: רשימת היתר אופציונלית לכל ה-routes. **מומלץ מאוד להגדיר בפרודקשן**; ערכים מ-Supabase, Authentication, Users, ולא ב-repo.
- `EODHD_ALLOWED_USER_IDS`, `EODHD_COOKIE_SECRET`: כמתועד ב-`docs/eodhd-connection.md`.
- `GEMINI_API_KEY`, `FINNHUB_API_KEY`.
- `ALLOW_DEMO_API`: פיתוח מקומי בלבד, ראה בהמשך. לא להגדיר ב-Vercel.

הגדרה: Vercel, Settings, Environment Variables, בשרת בלבד (לא `NEXT_PUBLIC_`), ואז Redeploy.

## מצב דמו מקומי

מעקף בשרת קיים רק כאשר `NODE_ENV !== "production"` **וגם** `ALLOW_DEMO_API=1` (וגם אין `VERCEL_ENV`). הוא חל רק על בקשה **בלי** טוקן (טוקן שגוי עדיין 401), לא חל על `/api/market/eodhd`, ולא ניתן להפעלה ב-`next build`/`next start` או ב-Vercel. בפועל האפליקציה כולה דורשת התחברות (`AuthGate`), כך שהמעקף נועד רק לבדיקות מקומיות בכלי כמו curl.

## הערות serverless

הגבלת הקצב נשמרת בזיכרון התהליך: ב-serverless כל instance סופר לבד ו-cold start מאפס. זו הגנה בסיסית מפני לולאות ושימוש לרעה, לא מכסה מדויקת. להגנה קשיחה נדרש מאגר משותף (למשל Redis), מחוץ להיקף כאן. ניתן להשלים בהגבלת Gemini/Finnhub בצד הספק.

## תיאום עם PR #69 (`lib/server-auth.js`)

`lib/server-auth.mjs` מייצא את אותם שמות (`createAuthenticator`, `parseAllowedUserIds`, `authenticateRequest`) עם אותה סמנטיקה, ובנוסף דוחה משתמש אנונימי ומוסיף `createApiGuard`, `isDemoApiAllowed`. שם הקובץ שונה בכוונה כדי שלא יהיה קונפליקט מיזוג. לאחר מיזוג שני ה-PRים: ב-#69 להחליף את ה-import ל-`@/lib/server-auth.mjs` ולמחוק את `server-auth.js`. אין שינוי התנהגות ל-#69 חוץ מדחיית משתמש אנונימי; הרשימה `FINANCE_IMPORT_ALLOWED_USER_IDS` נשארת נפרדת ונכשלת סגור.

## מה דורש אימות חי

- טוקן Supabase אמיתי על Vercel Preview: 200 למשתמש מורשה, 401 בלי טוקן/טוקן פג, 403 למשתמש מחוץ ל-`API_ALLOWED_USER_IDS`.
- קריאות חיות ל-Gemini (תדריך וצ'אט, כולל ניסיון חוזר על 503), ל-Finnhub ול-EODHD.
- `FINNHUB_API_KEY` עדיין לא מוגדר: עד אז `/api/quote` מחזיר 503 גנרי והרשימה במעקב מציגה שגיאה.
- התנהגות הגבלת הקצב תחת instances מרובים.
