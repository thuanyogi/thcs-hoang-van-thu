const {test}=require('node:test');
const assert=require('node:assert/strict');
const taskId='00000000-0000-4000-8000-000000000001';
const modulePromise=import('../supabase/functions/telegram-notify/send.js');
test('missing configuration never calls Telegram',async()=>{
 const {sendTelegram}=await modulePromise;
 assert.equal((await sendTelegram({taskId,fetcher:()=>{throw Error('must not call');}})).status,'not_configured');
});
test('sends only minimal task data to configured destination',async()=>{
 const {sendTelegram}=await modulePromise;
 const result=await sendTelegram({token:'test',chatId:'test-chat',taskId,fetcher:async(url,opts)=>{
  const body=JSON.parse(opts.body);assert.equal(body.chat_id,'test-chat');assert.ok(body.text.includes(taskId));
  assert.deepEqual(Object.keys(body).sort(),['chat_id','link_preview_options','text']);
  return {ok:true,json:async()=>({ok:true})};
 }});assert.equal(result.status,'sent');
});
test('provider error and timeout remain separate notification outcomes',async()=>{
 const {sendTelegram}=await modulePromise;
 const args={token:'test',chatId:'test-chat',taskId};
 assert.equal((await sendTelegram({...args,fetcher:async()=>({ok:false})})).status,'failed');
 assert.equal((await sendTelegram({...args,fetcher:async()=>{throw Object.assign(Error(),{name:'TimeoutError'});}})).status,'unknown');
});
test('durable claim prevents concurrent requests and retries from sending twice',async()=>{
 const {dispatchTelegram}=await import('../supabase/functions/telegram-notify/dispatch.js');
 let status='pending',sends=0;
 const deps={claim:async()=>{if(status!=='pending')return false;status='sending';return true;},send:async()=>{sends++;return {status:'sent'};},finish:async(_,next)=>{status=next;},readStatus:async()=>status};
 await Promise.all([dispatchTelegram(taskId,deps),dispatchTelegram(taskId,deps)]);
 assert.equal(sends,1);assert.equal(status,'sent');
 assert.equal((await dispatchTelegram(taskId,deps)).status,'sent');assert.equal(sends,1);
});
test('claim failure never sends; send failure and timeout remain durable terminal outcomes',async()=>{
 const {dispatchTelegram}=await import('../supabase/functions/telegram-notify/dispatch.js');
 let sends=0;
 assert.equal((await dispatchTelegram(taskId,{claim:async()=>{throw Error();},send:async()=>{sends++;}})).status,'failed');assert.equal(sends,0);
 for(const status of ['failed','unknown']){
  let stored;
  const result=await dispatchTelegram(taskId,{claim:async()=>true,send:async()=>({status}),finish:async(_,s)=>{stored=s;}});
  assert.equal(result.status,status);assert.equal(stored,status);
 }
});
