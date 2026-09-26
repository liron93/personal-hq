import { Home, Wallet, Dumbbell, Briefcase, Brain, ShoppingBasket } from "lucide-react";
import * as beit from "./beit-hadash/model";
import * as kesef from "./kesef/model";
import * as career from "./avoda/model";
import * as health from "./health/model";
import * as wellbeing from "./nefesh/model";
import * as household from "./household/model";

/*
  כל תת-חברה מרשמת את עצמה כאן:
  - slug: הנתיב (/companies/<slug>)
  - storeKey + init + summarize: כדי שהמנכ״ל יוכל לקרוא את מצבה בלי לפתוח אותה
  להוספת חברה: תיקייה חדשה ב-companies/, דף ב-app/companies/<slug>/, ושורה כאן.

  כלל קבוע לגבי נתונים: נתון שיותר מתת-חברה אחת צריכה (הכנסות, תאריכים משמעותיים
  וכד') לא משוכפל בתוך כל תת-חברה — הוא חי פעם אחת ב-lib/coreFacts.js ("נתוני ליבה"),
  וכל תת-חברה שצריכה אותו קוראת וכותבת אותו משם (useStore(coreFacts.STORE_KEY, ...)).
  נתון ששייך רק לתת-חברה אחת (פריטי שיפוץ, משימות חיפוש עבודה וכד') נשאר בתוך
  ה-model.js של אותה תת-חברה בלבד.
*/
export const COMPANIES = [
  { slug: "beit-hadash", name: "בית חדש", icon: Home, active: true, storeKey: beit.STORE_KEY, init: beit.INIT, summarize: beit.summarize },
  { slug: "kesef", name: "כלכלה והשקעות", icon: Wallet, active: true, storeKey: kesef.STORE_KEY, init: kesef.INIT, summarize: kesef.summarize },
  { slug: "health", name: "אימון ותזונה", icon: Dumbbell, active: true, storeKey: health.STORE_KEY, init: health.INIT, summarize: health.summarize },
  { slug: "avoda", name: "קריירה", icon: Briefcase, active: true, storeKey: career.STORE_KEY, init: career.INIT, summarize: career.summarize },
  { slug: "nefesh", name: "רווחה נפשית", icon: Brain, active: true, storeKey: wellbeing.STORE_KEY, init: wellbeing.INIT, summarize: wellbeing.summarize },
  // משק בית: מרחב משותף ללירון וליאור בלבד (לא שקד — ראה lib/authz/capabilities.js,
  // company.household.read/write ו-partner_household). כרגע (לפני שה-RBAC פעיל) מתנהגת
  // כמו כל תת-חברה אחרת: owner יחיד, בלי הבחנה בין משתמשים בפועל.
  { slug: "household", name: "משק בית", icon: ShoppingBasket, active: true, storeKey: household.STORE_KEY, init: household.INIT, summarize: household.summarize },
];
