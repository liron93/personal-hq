import { MarketError } from './eodhd-service.mjs';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export function createMarketHandler({ authorize, history, configured }) {
  return async request=>{
    try {
      if(!await authorize(request))return reply({error:'נדרשת התחברות עם משתמש שהורשה לחיבור נתוני השוק.'},401);
      if(request.method==='GET')return reply({configured:configured(),provider:'EODHD',market:'US',mode:'end-of-day',verified:false});
      if(request.method!=='POST')return reply({error:'פעולה לא נתמכת.'},405);
      if(!configured())return reply({error:'מפתח EODHD או הרשאת בעל החשבון חסרים בשרת.'},503);
      let body;try{body=await request.json();}catch{return reply({error:'בקשה לא תקינה.'},400);}
      if(typeof body?.symbol!=='string'||body.symbol.length>30)return reply({error:'סימול לא תקין.'},400);
      return reply(await history(body.symbol));
    }catch(error){return reply({error:error instanceof MarketError?error.message:'לא ניתן להשלים את הבקשה כרגע.'},error instanceof MarketError?error.status:502);}
  };
}
