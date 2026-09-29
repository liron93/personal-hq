import { createEodhdService } from '@/lib/eodhd-service.mjs';
import { createMarketHandler } from '@/lib/eodhd-handler.mjs';
import { createEodhdAuthorizer } from '@/lib/eodhd-auth.mjs';
import { createApiGuard } from '@/lib/server-auth.mjs';
import { readJsonBody } from '@/lib/api-utils.mjs';
import { encryptionReady, sealKey, openKey, keyCookie, KEY_COOKIE } from '@/lib/market-key.mjs';
export const dynamic = 'force-dynamic';
const history = createEodhdService();
const authorize = createEodhdAuthorizer({ guard: createApiGuard() });
const reply=(data,status=200,cookie)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
async function handler(request) {
  try {
    // אימות + הרשאה + קצב לפני כל גוף/עוגייה/מפתח. תשובות הכשל גנריות (401/403/429/503).
    const gate=await authorize(request);
    if(!gate.ok)return gate.response;
    const userId=gate.user.id;
    const secret=process.env.EODHD_COOKIE_SECRET;
    const ready=encryptionReady(secret);
    const cookie=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${KEY_COOKIE}=`))?.slice(KEY_COOKIE.length+1);
    const token=openKey(cookie,userId,secret);
    if(request.method==='GET')return reply({configured:!!token,storageReady:ready,verified:false});
    if(request.method==='DELETE')return reply({configured:false,storageReady:ready,verified:false},200,keyCookie('',process.env.NODE_ENV==='production'));
    if(request.method==='PUT'){
      if(!ready)return reply({error:'השמירה המאובטחת טרם הופעלה בשרת. אין להזין מפתח עד להפעלתה.'},503);
      const parsed=await readJsonBody(request,1024);
      if(!parsed.ok)return parsed.response;
      const body=parsed.value;
      const key=typeof body?.key==='string'?body.key.trim():'';
      if(!/^[A-Za-z0-9._-]{8,256}$/.test(key)||key.toLowerCase()==='demo')return reply({error:'יש להזין מפתח אישי תקין מחשבון EODHD.'},400);
      return reply({configured:true,storageReady:true,verified:false},200,keyCookie(sealKey(key,userId,secret),process.env.NODE_ENV==='production'));
    }
    return createMarketHandler({authorize:async()=>true,configured:()=>!!token,history:symbol=>history(symbol,token)})(request);
  }catch{return reply({error:'לא ניתן להשלים את הבקשה כרגע.'},502);}
}
export const GET=handler;
export const POST=handler;
export const PUT=handler;
export const DELETE=handler;
