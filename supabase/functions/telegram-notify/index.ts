import { sendTelegram } from './send.js';
import { dispatchTelegram } from './dispatch.js';
const url=Deno.env.get('SUPABASE_URL')!;
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function adminRest(path:string,method='GET',body?:unknown) {
 const response=await fetch(url+'/rest/v1/'+path,{method,headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
 if(!response.ok) throw new Error('notification_store_unavailable');
 return response.status===204?null:response.json();
}
Deno.serve(async req=>{
 const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(req.method!=='POST') return json({error:'method_not_allowed'},405);
 const authorization=req.headers.get('authorization')||'';
 if(!authorization.startsWith('Bearer ')) return json({error:'unauthorized'},401);
 const headers={apikey:anon,Authorization:authorization};
 try {
  const auth=await fetch(url+'/auth/v1/user',{headers,signal:AbortSignal.timeout(10000)});
  if(!auth.ok) return json({error:'unauthorized'},401);
  const user=await auth.json();
  const profile=await fetch(url+'/rest/v1/profiles?select=role&id=eq.'+encodeURIComponent(user.id),{headers,signal:AbortSignal.timeout(10000)});
  const people=profile.ok?await profile.json():[];
  if(!user.email_confirmed_at||!['bgh','department_head'].includes(people[0]?.role)) return json({error:'forbidden'},403);
  if(Number(req.headers.get('content-length')||0)>1024) return json({error:'invalid_request'},400);
  const input=await req.json();
  const send=(taskId:string)=>sendTelegram({token:Deno.env.get('TELEGRAM_BOT_TOKEN'),chatId:Deno.env.get('TELEGRAM_CHAT_ID'),taskId});
  if(input.mode==='test') {
   if(people[0].role!=='bgh') return json({error:'forbidden'},403);
   const result=await send('00000000-0000-4000-8000-000000000001');
   return json(result,result.status==='sent'?200:503);
  }
  if(!uuid.test(input.taskId||'')) return json({error:'invalid_task'},400);
  const tasksResponse=await fetch(url+'/rest/v1/tasks?select=id,assigner_id&id=eq.'+input.taskId,{headers,signal:AbortSignal.timeout(10000)});
  if(!tasksResponse.ok) return json({error:'task_unavailable'},503);
  const tasks=await tasksResponse.json();
  if(tasks[0]?.assigner_id!==user.id) return json({error:'not_found'},404);
  const result=await dispatchTelegram(input.taskId,{
   claim:(id:string)=>adminRest('rpc/claim_telegram_task','POST',{p_task_id:id}),send,
   readStatus:async(id:string)=>(await adminRest('telegram_task_notifications?select=status&task_id=eq.'+id))[0]?.status,
   finish:(id:string,status:string)=>adminRest('telegram_task_notifications?task_id=eq.'+id+'&status=eq.sending','PATCH',{status,updated_at:new Date().toISOString()})
  });
  return json(result);
 } catch { return json({status:'unknown'},503); }
});
