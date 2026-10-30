/* Read-only live test. Sends authorized task context to Gemini, never writes DB. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const config=JSON.parse(fs.readFileSync('plans/private-test-credentials.json'));
const key=fs.readFileSync('school-data.js','utf8').match(/sb_publishable_[A-Za-z0-9_-]+/)[0];
const report={date:new Date().toISOString(),checks:[]};
async function request(path,body,token,extra={}){
 const r=await fetch(config.url+path,{method:body?'POST':'GET',headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...extra},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
 return {status:r.status,data:await r.json()};
}
function pass(label){report.checks.push(label);console.log('PASS '+label);}
(async()=>{
 let r=await request('/functions/v1/task-chat',{question:'Tôi có bao nhiêu công việc?'});assert.equal(r.status,401);pass('No JWT rejected');
 r=await request('/functions/v1/task-chat',{question:'x'},null,{Origin:'https://untrusted.example'});assert.equal(r.status,403);pass('Unapproved origin rejected');
 for(const role of ['teacherA','bgh']){
  const u=config.users[role];r=await request('/auth/v1/token?grant_type=password',{email:u.email,password:u.password});assert.equal(r.status,200);const token=r.data.access_token;
  r=await request('/functions/v1/school-tasks',undefined,token);assert.equal(r.status,200);const ids=new Set(r.data.tasks.map(t=>t.id)),total=r.data.tasks.length;
  r=await request('/functions/v1/task-chat',{question:'Tôi có bao nhiêu công việc? Tóm tắt ngắn và nêu mã nguồn công việc.'},token);
  if(r.status!==200){report.providerStatus=r.status;report.providerMessage=r.data.error;throw Error('chat_request_failed');}
  assert.equal(typeof r.data.answer,'string');assert.ok(r.data.answer.length);assert.ok(r.data.sources.every(s=>ids.has(s.id)));
  const owned=role==='teacherA'?total:undefined;if(owned!==undefined)assert.equal(r.data.summary.authorizedTotal,owned);
  report[role]={sourceCount:r.data.sources.length,authorizedTotal:r.data.summary.authorizedTotal};pass(role+' Gemini answer cites only authorized tasks');
  r=await request('/functions/v1/task-chat',{question:'',role:'bgh'},token);assert.equal(r.status,422);pass(role+' rejects empty question and caller-supplied role');
 }
 report.result='passed';
})().catch(e=>{report.result='failed';report.error=e.message;console.log('FAIL '+e.message);process.exitCode=1;}).finally(()=>fs.writeFileSync('plans/reports/task-chat-live-261030.json',JSON.stringify(report,null,2)));
