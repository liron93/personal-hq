import { Home, Wallet, Dumbbell, Briefcase, Brain } from "lucide-react";
import * as beit from "./beit-hadash/model";

/*
  כל תת-חברה מרשמת את עצמה כאן:
  - slug: הנתיב (/companies/<slug>)
  - storeKey + init + summarize: כדי שהמנכ"ל יוכל לקרוא את מצבה בלי לפתוח אותה
  להוספת חברה: תיקייה חדשה ב-companies/, דף ב-app/companies/<slug>/, ושורה כאן.
*/
export const COMPANIES = [
  { slug: "beit-hadash", name: "בית חדש", icon: Home, active: true, storeKey: beit.STORE_KEY, init: beit.INIT, summarize: beit.summarize },
  { slug: "kesef", name: "כלכלה והשקעות", icon: Wallet, active: false },
  { slug: "imun", name: "אימון ותזונה", icon: Dumbbell, active: false },
  { slug: "avoda", name: "חיפוש עבודה", icon: Briefcase, active: false },
  { slug: "nefesh", name: "רווחה נפשית", icon: Brain, active: false },
];
