/* Authorized synthetic Supabase integration; run only after the controller verifies backup. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),PRIVATE=path.join(ROOT,'plans/private-test-credentials.json');
const REPORT=path.join(ROOT,'plans/reports/live-workflow-261030.json');
const TABLES=['departments','profiles','tasks','task_submissions','task_events','evidence_files'];
const report={startedAt:new Date().toISOString(),checks:[],existingData:{},outcome:'running'};
const check=(value,label)=>{if(!value)throw new Error(label);};
const pass=label=>{report.checks.push(label);console.log('PASS '+label);};
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const uuid=()=>crypto.randomUUID();
let config,credentials,before;
function privateJson(file,label){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new Error(label);}}
function savePrivate(){fs.mkdirSync(path.dirname(PRIVATE),{recursive:true});fs.writeFileSync(PRIVATE,JSON.stringify(credentials,(key,value)=>key==='token'?undefined:value,2),{mode:0o600});fs.chmodSync(PRIVATE,0o600);}
function saveReport(){fs.mkdirSync(path.dirname(REPORT),{recursive:true});fs.writeFileSync(REPORT,JSON.stringify({...report,finishedAt:new Date().toISOString()},null,2));}
async function request(route,{body,token,admin=false,method}={}){
 const headers={apikey:admin?config.serviceKey:config.anonKey,...(admin||token?{Authorization:'Bearer '+(admin?config.serviceKey:token)}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})};
 const response=await fetch(config.url+route,{method:method||(body===undefined?'GET':'POST'),headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(45000)});
 const data=await response.json().catch(()=>null);return {status:response.status,data};
}
async function rows(table){const all=[];for(let offset=0;;offset+=1000){const result=await request('/rest/v1/'+table+'?select=*&order=id.asc&limit=1000&offset='+offset,{admin:true});check(result.status===200,'Không đọc được baseline '+table);all.push(...result.data);if(result.data.length<1000)return all;}}
async function snapshot(){const result={};for(const table of TABLES)result[table]=await rows(table);return result;}
async function preserveExisting(){
 if(!before)return;
 const after=await snapshot();
 for(const table of TABLES){const current=new Map(after[table].map(row=>[row.id,row]));const old=before[table];const beforeHash=sha(canonical(old));
  const selected=old.map(row=>current.get(row.id));check(selected.every(Boolean),'Mất bản ghi gốc '+table);
  const afterHash=sha(canonical(selected));report.existingData[table]={count:old.length,beforeSha256:beforeHash,afterSha256:afterHash,unchanged:beforeHash===afterHash};check(beforeHash===afterHash,'Nội dung gốc thay đổi '+table);
 }
 pass('Sáu bảng: mọi bản ghi có sẵn giữ nguyên ID và SHA-256 nội dung');
}
async function provision(){
 if(fs.existsSync(PRIVATE)){
  credentials=privateJson(PRIVATE,'Không đọc được fixture credentials riêng');check(credentials.url===config.url&&credentials.users&&credentials.departments,'Fixture riêng không khớp project');fs.chmodSync(PRIVATE,0o600);
 }else{
  const run=Date.now().toString(36);credentials={url:config.url,run,createdAt:new Date().toISOString(),departments:{a:uuid(),b:uuid()},users:{},tasks:[],uploads:[]};
  for(const role of ['bgh','head','teacherA','teacherB'])credentials.users[role]={email:'school-workflow-'+run+'-'+role.toLowerCase()+'@example.test',password:crypto.randomBytes(24).toString('base64url')+'!aA1',id:null};savePrivate();
 }
 for(const key of ['a','b']){const id=credentials.departments[key],existing=await request('/rest/v1/departments?select=id&id=eq.'+id,{admin:true});check(existing.status===200,'Không đọc được tổ thử');if(!existing.data.length){const result=await request('/rest/v1/departments',{admin:true,body:{id,name:'[KIỂM THỬ '+credentials.run+'] Tổ '+key.toUpperCase()}});check(result.status===201,'Không tạo được tổ thử');}}
 for(const [key,user] of Object.entries(credentials.users)){
  if(!user.id){const result=await request('/auth/v1/admin/users',{admin:true,body:{email:user.email,password:user.password,email_confirm:true,user_metadata:{display_name:'[KIỂM THỬ] '+key}}});check(result.status===200||result.status===201,'Không cấp được tài khoản thử '+key);user.id=result.data.id;savePrivate();}
  const existing=await request('/rest/v1/profiles?select=*&id=eq.'+user.id,{admin:true});check(existing.status===200,'Không đọc được profile thử');
  const role=key==='head'?'department_head':key==='bgh'?'bgh':'teacher',department_id=key==='bgh'?null:credentials.departments[key==='teacherB'?'b':'a'];
  if(!existing.data.length){const result=await request('/rest/v1/profiles',{admin:true,body:{id:user.id,display_name:'[KIỂM THỬ '+credentials.run+'] '+key,role,department_id}});check(result.status===201,'Không cấp được profile thử '+key);}else check(existing.data[0].role===role&&existing.data[0].department_id===department_id,'Profile fixture không khớp; không sửa tài khoản hiện có');
  const session=await request('/auth/v1/token?grant_type=password',{body:{email:user.email,password:user.password}});check(session.status===200&&session.data.access_token,'Không đăng nhập được tài khoản thử '+key);user.token=session.data.access_token;
  const account=await request('/auth/v1/user',{token:user.token});check(account.status===200&&account.data.email_confirmed_at,'Email tài khoản thử chưa xác nhận');
 }
 // Tokens are runtime-only; save reusable passwords/IDs without recording sessions.
 const tokens=Object.fromEntries(Object.entries(credentials.users).map(([key,user])=>[key,user.token]));
 for(const user of Object.values(credentials.users))delete user.token;savePrivate();for(const [key,token] of Object.entries(tokens))credentials.users[key].token=token;
 pass('Cấp 4 tài khoản mẫu và 2 tổ riêng; đăng nhập Email/Password thật; không đổi cấu hình Confirm Email');
}
function persistFixtures(){const clean=JSON.parse(JSON.stringify(credentials));for(const user of Object.values(clean.users))delete user.token;const live=credentials;credentials=clean;savePrivate();credentials=live;}
async function edge(user,body,query=''){return request('/functions/v1/school-tasks'+query,{...(body===undefined?{}:{body}),token:user?.token});}
async function action(user,taskId,verb,input={},requestId=uuid()){return edge(user,{action:verb,taskId,input,requestId});}
async function task(user,flags={}){
 const input={title:'[KIỂM THỬ '+credentials.run+'] '+(flags.title||'Luồng công việc'),description:'Dữ liệu tổng hợp phục vụ xác minh; không chứa thông tin học sinh.',assigneeId:credentials.users.teacherA.id,scope:user===credentials.users.head?'department':'school',dueDate:report.dueDate,requiresApproval:false,requiresEvidence:false,...flags};delete input.titleSuffix;
 const requestId=uuid();const [one,two]=await Promise.all([edge(user,{requestId,input}),edge(user,{requestId,input})]);check(one.status===200&&two.status===200&&one.data.task.id===two.data.task.id,'Tạo việc/retry đồng thời thất bại');
 const id=one.data.task.id;credentials.tasks.push(id);persistFixtures();const conflict=await edge(user,{requestId,input:{...input,title:input.title+' khác'}});check(conflict.status===409,'UUID tạo việc dùng lại khác nội dung không bị từ chối');return id;
}
function pdf(){const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>','<< /Length 0 >>\nstream\n\nendstream'];let out='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out));out+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}const xref=Buffer.byteLength(out);out+='xref\n0 5\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';return Buffer.from(out);}
async function upload(user,taskId,name,bytes){
 const requestId=uuid(),input={name,type:'application/pdf',size:bytes.length};const prepared=await edge(user,{action:'prepare-upload',taskId,input,requestId});check(prepared.status===200&&prepared.data.storagePath&&prepared.data.token,'Không chuẩn bị được upload');
 const retry=await edge(user,{action:'prepare-upload',taskId,input,requestId});check(retry.status===200&&retry.data.storagePath===prepared.data.storagePath,'Retry reservation không ổn định');
 const target=new URL(prepared.data.signedUrl,config.url+'/storage/v1');check(target.origin===config.url,'Signed upload sai origin');
 const form=new FormData();form.append('cacheControl','3600');form.append('',new Blob([bytes],{type:'application/pdf'}),name);
 const response=await fetch(target,{method:'PUT',headers:{apikey:config.anonKey,'x-upsert':'false'},body:form,signal:AbortSignal.timeout(45000)});check(response.ok,'Không upload được bytes tệp private');
 credentials.uploads.push(prepared.data.storagePath);persistFixtures();return {storagePath:prepared.data.storagePath,originalName:name,mimeType:'application/pdf',sizeBytes:bytes.length};
}
async function run(){
 check(process.env.SCHOOL_BACKUP_VERIFIED==='1','Chưa có BACKUP_VERIFIED; script từ chối đọc key hoặc thay đổi remote');
 config=privateJson('/private/tmp/school-live-admin.json','Không đọc được cấu hình quản trị riêng');config.url=config.url.replace(/\/$/,'');check(config.url==='https://iqchlkfmgxeafgsbconv.supabase.co'&&config.anonKey&&config.serviceKey,'Cấu hình project không hợp lệ');
 before=await snapshot();report.baselineCounts=Object.fromEntries(TABLES.map(table=>[table,before[table].length]));
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const future=days=>new Date(Date.parse(day+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);report.dueDate=future(2);report.newDueDate=future(5);
 await provision();const {bgh,head,teacherA:a,teacherB:b}=credentials.users;
 let result=await edge(null);check(result.status===401,'API chưa đăng nhập không bị chặn');pass('Không JWT bị chặn; danh tính kiểm từ Auth');
 const auto=await task(bgh,{title:'[KIỂM THỬ '+credentials.run+'] Tự hoàn thành'});const startId=uuid();
 const starts=await Promise.all([action(a,auto,'start',{},startId),action(a,auto,'start',{},startId)]);check(starts.every(r=>r.status===200&&r.data.task.status==='in_progress'),'Bắt đầu/retry thất bại');
 result=await action(a,auto,'start');check(result.status===409,'Bắt đầu trạng thái cũ không bị chặn');result=await action(a,auto,'submit',{body:'[KIỂM THỬ] Đã hoàn thành',evidence:[]});check(result.status===200&&result.data.task.status==='completed'&&result.data.submission.review_status==='not_required','Nộp không duyệt chưa hoàn thành');pass('Tạo/retry/bắt đầu/nộp tự hoàn thành thật, UUID khác nội dung và trạng thái cũ bị chặn');
 result=await request('/rest/v1/rpc/school_task_command',{token:a.token,body:{p_request_id:uuid(),p_action:'start',p_task_id:auto,p_input:{},p_commit:true}});check(result.status>=400&&result.data?.code==='PT409','RPC trực tiếp chấp nhận trạng thái đã hoàn thành');
 result=await request('/rest/v1/rpc/school_task_command',{body:{p_request_id:uuid(),p_action:'start',p_task_id:auto,p_input:{},p_commit:true}});check(result.status>=400,'RPC cho phép anon thực hiện lệnh');
 const pending=await task(bgh,{requiresApproval:true,requiresEvidence:true});
 result=await action(a,pending,'prepare-upload',{name:'quá-lớn.pdf',type:'application/pdf',size:26214401});check(result.status===422,'Tệp >25 MB không bị chặn');result=await action(a,pending,'prepare-upload',{name:'không-hợp-lệ.exe',type:'application/pdf',size:20});check(result.status===422,'Sai extension/MIME không bị chặn');
 const fake=await upload(a,pending,'[KIEM-THU]-gia-mao.pdf',Buffer.from('This is not a PDF.'));result=await action(a,pending,'submit',{body:'[KIỂM THỬ] Chặn giả mạo',evidence:[fake]});check(result.status===422,'Server chấp nhận bytes PDF giả');
 const bytes=pdf(),evidence=await upload(a,pending,'[KIEM-THU]-minh-chung.pdf',bytes);
 result=await request('/rest/v1/rpc/school_task_command',{token:a.token,body:{p_request_id:uuid(),p_action:'submit',p_task_id:pending,p_input:{body:'Bypass phải bị chặn',evidence:[evidence]},p_commit:true}});check(result.status>=400&&result.data?.code==='22023','RPC bỏ qua xác minh bytes được phép');
 const submitId=uuid(),submitted=await action(a,pending,'submit',{body:'[KIỂM THỬ] Báo cáo lần 1',evidence:[evidence]},submitId);check(submitted.status===200&&submitted.data.task.status==='pending_review','Không nộp được báo cáo có minh chứng');
 result=await action(a,pending,'submit',{body:'[KIỂM THỬ] Báo cáo lần 1',evidence:[evidence]},submitId);check(result.status===200&&result.data.submission.id===submitted.data.submission.id,'Retry submit tạo trùng');
 result=await edge(a,undefined,'?id='+pending);check(result.status===200&&result.data.files.length===1&&result.data.submissions.length===1,'Detail thiếu báo cáo/tệp');const fileId=result.data.files[0].id;
 result=await edge(a,{action:'signed-download',fileId,requestId:uuid()});check(result.status===200&&result.data.expiresIn===60,'Không ký được download đúng quyền');const download=await fetch(result.data.signedUrl,{signal:AbortSignal.timeout(30000)});check(download.ok&&sha(Buffer.from(await download.arrayBuffer()))===sha(bytes),'Download không khớp bytes gốc');
 for(const [table,query] of [['tasks','id=eq.'+pending],['task_submissions','task_id=eq.'+pending],['evidence_files','id=eq.'+fileId]]){result=await request('/rest/v1/'+table+'?select=*&'+query,{token:b.token});check(result.status===200&&result.data.length===0,'Teacher B đọc được '+table);}
 result=await edge(b,undefined,'?id='+pending);check(result.status===404,'Teacher B mở được task ID của A');result=await edge(b,{action:'signed-download',fileId,requestId:uuid()});check(result.status===404,'Teacher B ký được file A');
 const filePath=evidence.storagePath.split('/').map(encodeURIComponent).join('/');for(const mode of ['authenticated','public']){const response=await fetch(config.url+'/storage/v1/object/'+mode+'/task-evidence/'+filePath,{headers:{apikey:config.anonKey,...(mode==='authenticated'?{Authorization:'Bearer '+b.token}:{})},signal:AbortSignal.timeout(30000)});check(!response.ok,'Storage cho tải tệp ngoài quyền/public');await response.body?.cancel();}
 pass('Upload/download PDF thật private, byte verification chống giả mạo, >25 MB/sai loại bị chặn; teacher B bị chặn API/DB/Storage');
 const submissionId=submitted.data.submission.id;result=await action(head,pending,'review',{submissionId,decision:'approve'});check(result.status===403,'Tổ trưởng duyệt được việc trường');result=await action(bgh,pending,'review',{submissionId,decision:'return',reason:' '});check(result.status===422,'Trả lại không lý do được phép');
 result=await action(bgh,pending,'review',{submissionId,decision:'return',reason:'[KIỂM THỬ] Bổ sung nhận xét',newDueDate:report.newDueDate});check(result.status===200&&result.data.task.status==='in_progress'&&new Date(result.data.task.due_at).toISOString()===report.newDueDate+'T16:59:59.000Z','Trả lại/đổi hạn không đúng');
 const second=await upload(a,pending,'[KIEM-THU]-bo-sung.pdf',bytes);result=await action(a,pending,'submit',{body:'[KIỂM THỬ] Đã bổ sung',evidence:[second]});check(result.status===200,'Không nộp lại được');const finalSubmission=result.data.submission.id,reviewId=uuid();const reviews=await Promise.all([action(bgh,pending,'review',{submissionId:finalSubmission,decision:'approve'},reviewId),action(bgh,pending,'review',{submissionId:finalSubmission,decision:'approve'},reviewId)]);check(reviews.every(r=>r.status===200&&r.data.task.status==='completed'),'Duyệt/retry đồng thời thất bại');
 result=await edge(a,undefined,'?id='+pending);check(result.status===200&&result.data.submissions.length===2&&result.data.files.length===2&&result.data.events.filter(e=>e.event_type==='approved').length===1,'Lịch sử hoặc số bản ghi sau duyệt sai');check(result.data.events.some(e=>e.event_type==='due_changed'&&e.reason==='[KIỂM THỬ] Bổ sung nhận xét'&&e.old_due_at&&e.new_due_at),'Thiếu lịch sử hạn cũ/mới/lý do');
 pass('Nộp → trả lại có lý do/đổi hạn Việt Nam → nộp lại → duyệt; giữ 2 báo cáo/tệp và không duyệt trùng');
 const departmental=await task(head,{requiresApproval:true});result=await action(a,departmental,'submit',{body:'[KIỂM THỬ] Việc tổ',evidence:[]});check(result.status===200,'Không nộp được việc tổ');const departmentSubmission=result.data.submission.id;result=await action(bgh,departmental,'review',{submissionId:departmentSubmission,decision:'approve'});check(result.status===403,'BGH duyệt sai scope tổ');result=await action(head,departmental,'review',{submissionId:departmentSubmission,decision:'approve'});check(result.status===200&&result.data.task.status==='completed','Tổ trưởng không duyệt được việc đúng tổ');
 result=await edge(head,{requestId:uuid(),input:{title:'[KIỂM THỬ] Chặn khác tổ',description:'Không được tạo',assigneeId:b.id,scope:'department',dueDate:report.dueDate,requiresApproval:false,requiresEvidence:false}});check(result.status===422||result.status===403,'Tổ trưởng giao được việc ngoài tổ');
 result=await request('/rest/v1/rpc/school_task_command',{token:a.token,body:{p_request_id:uuid(),p_action:'create',p_task_id:null,p_input:{role:'bgh',title:'[KIỂM THỬ] Giả quyền',description:'Không được tạo',assigneeId:a.id,scope:'school',dueDate:report.dueDate,requiresApproval:false,requiresEvidence:false},p_commit:true}});check(result.status>=400&&result.data?.code==='42501','Giáo viên giả role được quyền tạo việc qua RPC');
 result=await request('/rest/v1/rpc/school_task_command',{token:a.token,body:{p_actor_id:bgh.id,p_request_id:uuid(),p_action:'start',p_task_id:pending,p_input:{},p_commit:true}});check(result.status>=400,'RPC nhận actor ID tùy ý');
 result=await request('/rest/v1/tasks?id=eq.'+pending,{token:a.token,method:'PATCH',body:{status:'todo'}});check(result.status>=400,'Client sửa trực tiếp task ngoài RPC được phép');
 pass('Đúng scope BGH/tổ trưởng; chặn khác tổ, giả role/actor và ghi trực tiếp bảng');
 await preserveExisting();report.outcome='passed';report.fixtureTaskCount=credentials.tasks.length;report.retainedSyntheticAccounts=4;pass('Dữ liệu/tài khoản KIỂM THỬ được giữ lại theo phạm vi; credentials chỉ trong file 0600');
}
run().catch(async error=>{report.outcome='failed';report.failure=error.message;console.error('FAIL '+error.message);try{await preserveExisting();}catch(preservation){report.preservationFailure=preservation.message;console.error('FAIL '+preservation.message);}process.exitCode=1;}).finally(saveReport);
