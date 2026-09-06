/*
  נתוני ליבה (core facts): מידע שיותר מתת-חברה אחת צריכה (הכנסות, תאריכים משמעותיים
  וכד'). הם חיים כאן במקום אחד — לא כעותק בתוך כל תת-חברה שמשתמשת בהם.
  ראה companies/registry.js להסבר מלא על מתי להשתמש בזה.
  שימוש: useStore(STORE_KEY, INIT) מ-lib/store.js, בדיוק כמו שכל תת-חברה עושה ל-model.js שלה.
*/
export const STORE_KEY = "hq:core:v1";

export const INIT = {
  mySalary: 17500,       // משכורת שלי — נוכחית
  myRaise: 20000,        // משכורת שלי — עתידית (אחרי עלייה)
  wifeSalary: 15500,     // משכורת אשתי
  mortgageMonthly: 8500, // החזר משכנתא קיימת/חודש (נשאר עד למכירת הדירה)
  athensMonthly: 0,      // הכנסת אתונה/חודש
  frozen: false,         // הקפאת משכנתא (מילואים)
};
