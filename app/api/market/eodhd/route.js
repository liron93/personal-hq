import { createClient } from '@supabase/supabase-js';
import { createEodhdService } from '@/lib/eodhd-service.mjs';
import { createMarketHandler } from '@/lib/eodhd-handler.mjs';
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
  return !error && !!data.user && !data.user.is_anonymous && allowed().includes(data.user.id);
}
const handler=createMarketHandler({authorize,history:symbol=>history(symbol,process.env.EODHD_API_KEY),configured:()=>!!process.env.EODHD_API_KEY && process.env.EODHD_API_KEY.toLowerCase()!=='demo' && allowed().length>0});
export const GET=handler;
export const POST=handler;
