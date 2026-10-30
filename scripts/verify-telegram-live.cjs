/* Run only after approved DB preview and a verified backup. No secret values are logged. */
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const fixture=JSON.parse(fs.readFileSync('plans/private-test-credentials.json'));
const source=fs.readFileSync('school-data.js','utf8'),key=source.match(/sb_publishable_[A-Za-z0-9_-]+/)[0];
const report={date:new Date().toISOString(),checks:[]};
async function req(path,body,token){
 const r=await fetch(fixture.url+path,{method:body?'POST':'GET',headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
 return {status:r.status,data:await r.json()};
}
const pass=label=>{report.checks.push(label);console.log('PASS '+label);};
(async()=>{
 const tokens={};for(const role of ['bgh','head','teacherA']){const u=fixture.users[role];const r=await req('/auth/v1/token?grant_type=password',{email:u.email,password:u.password});assert.equal(r.status,200);tokens[role]=r.data.access_token;}
 let r=await req('/functions/v1/school-tasks',undefined,tokens.bgh);assert.equal(r.status,200);const before=r.data.tasks;
 r=await req('/functions/v1/telegram-notify',{taskId:crypto.randomUUID()},tokens.teacherA);assert.equal(r.status,403);pass('Teacher cannot invoke notification endpoint');
 r=await req('/functions/v1/telegram-notify',{taskId:crypto.randomUUID()},tokens.bgh);assert.equal(r.status,404);pass('Nonexistent task cannot send');
 const requestId=crypto.randomUUID();report.taskId=requestId;
 const input={title:'[KIỂM THỬ TELEGRAM] Task mới',description:'Dữ liệu tổng hợp kiểm tra gửi Telegram sau lưu DB.',assigneeId:fixture.users.teacherA.id,scope:'school',dueDate:'2026-11-05',requiresApproval:false,requiresEvidence:false};
 r=await req('/functions/v1/school-tasks',{requestId:crypto.randomUUID(),input:{...input,dueDate:'2026-02-30'}},tokens.bgh);assert.equal(r.status,422);pass('Invalid create rejected before DB and notification');
 const results=await Promise.all([req('/functions/v1/school-tasks',{requestId,input},tokens.bgh),req('/functions/v1/school-tasks',{requestId,input},tokens.bgh)]);
 for(const item of results){assert.equal(item.status,200);assert.equal(item.data.task.id,requestId);}
 assert.ok(results.some(x=>x.data.notification?.status==='sent'));pass('Concurrent create commits one task and sends Telegram');
 r=await req('/functions/v1/school-tasks',{requestId,input},tokens.bgh);assert.equal(r.status,200);assert.equal(r.data.notification.status,'sent');pass('Retry returns saved task and durable sent outcome');
 r=await req('/functions/v1/telegram-notify',{taskId:requestId},tokens.head);assert.equal(r.status,404);pass('Other assigner cannot dispatch task');
 r=await req('/functions/v1/school-tasks',undefined,tokens.bgh);assert.equal(r.status,200);const after=r.data.tasks;
 assert.equal(after.filter(x=>x.id===requestId).length,1);for(const task of before)assert.deepEqual(after.find(x=>x.id===task.id),task);
 pass('Existing task data preserved; exactly one new synthetic task');
 report.result='passed';
})().catch(e=>{report.result='failed';report.error=e.name;console.error('FAIL '+e.name);process.exitCode=1;}).finally(()=>fs.writeFileSync('plans/reports/telegram-live-261030.json',JSON.stringify(report,null,2)));
