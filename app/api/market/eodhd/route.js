import { createClient } from '@supabase/supabase-js';
import { createEodhdService } from '@/lib/eodhd-service.mjs';
import { createMarketHandler } from '@/lib/eodhd-handler.mjs';
import { encryptionReady, sealKey, openKey, keyCookie, KEY_COOKIE } from '@/lib/market-key.mjs';
export const dynamic = 'force-dynamic';
const history = createEodhdService();
const allowed = () => (process.env.EODHD_ALLOWED_USER_IDS || '').split(',').map(x=>x.trim()).filter(Boolean);
async function authorize(request) {
  const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if(!token || !allowed().length)return false;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url || !key)return false;
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(token);
  return !error && !!data.user && !data.user.is_anonymous && allowed().includes(data.user.id) ? data.user.id : null;
}
const reply=(data,status=200,cookie)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
async function handler(request) {
  try {
    const userId=await authorize(request);
    if(!userId)return reply({error:'נדרשת התחברות עם משתמש מורשה.'},401);
    const secret=process.env.EODHD_COOKIE_SECRET;
    const ready=encryptionReady(secret);
    const cookie=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${KEY_COOKIE}=`))?.slice(KEY_COOKIE.length+1);
    const token=openKey(cookie,userId,secret);
    if(request.method==='GET')return reply({configured:!!token,storageReady:ready,verified:false});
    if(request.method==='DELETE')return reply({configured:false,storageReady:ready,verified:false},200,keyCookie('',process.env.NODE_ENV==='production'));
    if(request.method==='PUT'){
      if(!ready)return reply({error:'השמירה המאובטחת טרם הופעלה בשרת. אין להזין מפתח עד להפעלתה.'},503);
      const raw=await request.text();
      if(raw.length>1024)return reply({error:'המפתח ארוך מדי.'},400);
      let body;try{body=JSON.parse(raw);}catch{return reply({error:'בקשה לא תקינה.'},400);}
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
