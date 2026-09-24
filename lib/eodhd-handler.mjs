import { MarketError, ERROR_CATEGORIES } from './eodhd-service.mjs';
import { readJsonBody } from './api-utils.mjs';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export function createMarketHandler({ authorize, history, configured }) {
  return async request=>{
    try {
      if(!await authorize(request))return reply({error:'נדרשת התחברות עם משתמש שהורשה לחיבור נתוני השוק.',category:ERROR_CATEGORIES.NOT_CONFIGURED},401);
      if(request.method==='GET')return reply({configured:configured(),provider:'EODHD',market:'US',mode:'end-of-day',verified:false});
      if(request.method!=='POST')return reply({error:'פעולה לא נתמכת.'},405);
      if(!configured())return reply({error:'מפתח EODHD אישי טרם נשמר. יש להזין מפתח למעלה לפני בדיקת חיבור.',category:ERROR_CATEGORIES.NOT_CONFIGURED},503);
      const parsed=await readJsonBody(request,1024);if(!parsed.ok)return parsed.response;const body=parsed.value;
      if(typeof body?.symbol!=='string'||body.symbol.length>30)return reply({error:'סימול לא תקין.',category:ERROR_CATEGORIES.INVALID_SYMBOL},400);
      return reply(await history(body.symbol));
    }catch(error){
      // כל תקלה בשליפה עוברת דרך MarketError עם קטגוריה מוצרית; כל דבר אחר (תקלה לא צפויה
      // בקוד עצמו, לא בספק) מקבל תשובה גנרית בלי לחשוף פרטים.
      if(error instanceof MarketError)return reply({error:error.message,category:error.category},error.status);
      return reply({error:'לא ניתן להשלים את הבקשה כרגע.',category:ERROR_CATEGORIES.UNKNOWN},502);
    }
  };
}
