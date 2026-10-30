/* Public configuration only. Authorization is enforced by Supabase Auth/RLS and the Edge Function. */
(function(root){
 'use strict';
 const URL='https://iqchlkfmgxeafgsbconv.supabase.co',KEY='sb_publishable_qV3w4NTmwaFJIoFSZUFyug_6eKvYAA_';
 const SESSION_KEY='school-supabase-session',listeners=new Set();
 let session=null,actor=null,tasks=[],departments=[],refreshing=null,generation=0;
 const users=[],requests=new Set();
 const notify=source=>listeners.forEach(fn=>fn(source));
 const copy=x=>JSON.parse(JSON.stringify(x));
 function clear(remove=true){generation++;for(const request of requests)request.abort();requests.clear();session=null;actor=null;tasks=[];users.splice(0);departments=[];if(remove)localStorage.removeItem(SESSION_KEY);}
 function persist(value){session={...value,expires_at:value.expires_at||Math.floor(Date.now()/1000)+value.expires_in};localStorage.setItem(SESSION_KEY,JSON.stringify(session));}
 function network(url,options){
  const controller=new AbortController();requests.add(controller);
  return fetch(url,{...options,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])})
   .catch(()=>{throw new Error(controller.signal.aborted?'Phiên đăng nhập đã thay đổi.':'Không kết nối được Supabase. Hãy kiểm tra mạng rồi thử lại.');})
   .finally(()=>requests.delete(controller));
 }
 async function auth(path,body,token){
  const response=await network(URL+'/auth/v1/'+path,{method:body?'POST':'GET',headers:{apikey:KEY,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw Object.assign(new Error(data.code==='email_not_confirmed'?'Email chưa được xác nhận. Hãy kiểm tra hộp thư và thư rác.':response.status===429?'Thao tác quá nhanh. Vui lòng chờ rồi thử lại.':'Không thể đăng nhập. Hãy kiểm tra email, mật khẩu hoặc liên kết đăng nhập.'),{status:response.status});
  return data;
 }
 async function access(){
  if(!session) throw new Error('Vui lòng đăng nhập.');
  if(session.expires_at*1000<Date.now()+60000){
   if(!refreshing) { const version=generation; refreshing=auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(value=>{if(version!==generation)throw new Error('Phiên đăng nhập đã thay đổi.');persist(value);}).catch(error=>{if(version===generation&&[400,401,403].includes(error.status)){clear();notify('signed-out');}throw error;}).finally(()=>{refreshing=null;}); }
   await refreshing;
  }
  if(!session)throw new Error('Vui lòng đăng nhập.');return session.access_token;
 }
 async function api(query='',body){
  const version=generation;const token=await access();
  const response=await network(URL+'/functions/v1/school-tasks'+query,{method:body?'POST':'GET',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));
  if(version!==generation)throw new Error('Phiên đăng nhập đã thay đổi.');
  if(!response.ok){
   if(response.status===401){clear();notify('signed-out');}
   throw Object.assign(new Error(data.error||'Chưa tải được dữ liệu. Vui lòng thử lại.'),{errors:data.errors,status:response.status});
  }
  return data;
 }
 const department=id=>departments.find(d=>d.id===id)?.name||null;
 const person=p=>({id:p.id,name:p.display_name,role:p.role==='department_head'?'head':p.role,department:department(p.department_id)});
 function task(t){return {id:t.id,title:t.title,description:t.description,scope:t.scope,department:t.scope==='department'?department(t.department_id):null,assignerId:t.assigner_id,assigneeId:t.assignee_id,dueDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t.due_at)),dueAt:t.due_at,completedAt:t.completed_at,returnedReason:t.returned_reason||null,submittedAt:t.submitted_at||null,status:t.status,requiresApproval:t.requires_approval,requiresEvidence:t.requires_evidence,createdAt:t.created_at};}
 async function refresh(){
  const version=generation;const data=await api();if(version!==generation)throw new Error('Phiên đăng nhập đã thay đổi.'); departments=data.departments;
  actor=person(data.actor);
  users.splice(0,users.length,...data.users.map(person));
  for(const p of data.names) if(!users.some(u=>u.id===p.id)) users.push({id:p.id,name:p.display_name,role:'display_only',department:null});
  tasks=data.tasks.map(task);
 }
 function validate(actorId,input){
  const errors={};
  if(actorId!==actor?.id||!canCreate(actor))return {permission:'Bạn không có quyền giao công việc.'};
  if(typeof input?.title!=='string'||!input.title.trim()||input.title.length>500)errors.title='Vui lòng nhập tên công việc (tối đa 500 ký tự).';
  if(typeof input?.description!=='string'||!input.description.trim()||input.description.length>20000)errors.description='Vui lòng nhập mô tả (tối đa 20.000 ký tự).';
  if(!users.some(u=>u.id===input.assigneeId&&u.role==='teacher'&&(actor.role==='bgh'||u.department===actor.department)))errors.assigneeId='Vui lòng chọn giáo viên phụ trách hợp lệ.';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input?.dueDate||'')||!Number.isFinite(Date.parse(input.dueDate))||new Date(input.dueDate).toISOString().slice(0,10)!==input.dueDate)errors.dueDate='Vui lòng chọn ngày thời hạn hợp lệ.';
  return errors;
 }
 const canCreate=p=>Boolean(p&&['bgh','head'].includes(p.role));
 const store={
  list:id=>id===actor?.id?copy(tasks):[],
  async get(id,taskId){if(id!==actor?.id) return null;const result=await api('?id='+encodeURIComponent(taskId));return task(result.task);},
  async create(id,input,requestId){
   const errors=validate(id,input);if(Object.keys(errors).length)throw Object.assign(new Error('Vui lòng kiểm tra thông tin.'),{errors});
   let result;
   try { result=await api('',{input,requestId}); }
   catch(error) {
    if(error.status) throw error;
    // A transport timeout can happen after commit; read back before reporting the outcome.
    try { const found=await api('?id='+encodeURIComponent(requestId));result={task:found.task,notification:{status:'unknown'}}; }
    catch { throw new Error('Chưa xác định kết quả lưu. Hãy tải lại danh sách hoặc thử lại với cùng yêu cầu.'); }
   }
   const saved=task(result.task);
   saved.notificationStatus=result.notification?.status||'unknown';
   tasks=tasks.filter(t=>t.id!==saved.id);tasks.push(saved);return copy(saved);
  },
  async detail(id,taskId){
   if(id!==actor?.id)throw new Error('Phiên đăng nhập đã thay đổi.');
   const result=await api('?id='+encodeURIComponent(taskId));
   return {...result,task:task(result.task),submissions:result.submissions||[],events:result.events||[],files:result.files||[]};
  },
  async action(id,taskId,action,input={},requestId){
   if(id!==actor?.id)throw new Error('Phiên đăng nhập đã thay đổi.');
   const result=await api('',{action,taskId,input,requestId});
   await refresh();
   return {...result,task:task(result.task)};
  },
  async upload(id,taskId,file){
   if(id!==actor?.id)throw new Error('Phiên đăng nhập đã thay đổi.');
   const version=generation;
   const prepared=await api('',{action:'prepare-upload',taskId,input:{name:file.name,type:file.type,size:file.size},requestId:crypto.randomUUID()});
   const target=new globalThis.URL(prepared.signedUrl,URL+'/storage/v1');
   if(target.origin!==URL||!target.pathname.startsWith('/storage/v1/object/upload/sign/'))throw new Error('Đường dẫn tải tệp không hợp lệ.');
   const data=new FormData();data.append('cacheControl','3600');data.append('',file);
   const response=await network(target.href,{method:'PUT',body:data,headers:{apikey:KEY,'x-upsert':'false'}});
   if(!response.ok)throw new Error('Chưa tải được tệp minh chứng. Vui lòng thử lại.');
   if(version!==generation)throw new Error('Phiên đăng nhập đã thay đổi.');
   return {storagePath:prepared.storagePath,originalName:file.name,mimeType:file.type,sizeBytes:file.size};
  },
  async download(id,fileId){
   if(id!==actor?.id)throw new Error('Phiên đăng nhập đã thay đổi.');
   const result=await api('',{action:'signed-download',fileId,requestId:crypto.randomUUID()});
   const target=new globalThis.URL(result.signedUrl,URL+'/storage/v1');
   if(target.origin!==URL||!target.pathname.startsWith('/storage/v1/object/sign/'))throw new Error('Đường dẫn tải xuống không hợp lệ.');
   return target.href;
  },refresh
 };
 async function initialize(){
  const hash=new URLSearchParams(location.hash.slice(1));
  if(hash.has('error_description')){history.replaceState(null,'',location.pathname+location.search);throw new Error('Liên kết đăng nhập không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.');}
  if(hash.get('access_token')&&hash.get('refresh_token')){
   persist({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_in:Number(hash.get('expires_in')||3600)});
   history.replaceState(null,'',location.pathname+location.search);
  } else {try{session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{clear();}}
  if(!session)return false;
  const version=generation;
  try { const user=await auth('user',null,await access());if(version!==generation)throw new Error('Phiên đăng nhập đã thay đổi.');persist({...session,user}); }
  catch(error){if(version===generation&&[400,401,403].includes(error.status)){clear();notify('signed-out');}throw error;}
  await refresh();return true;
 }
 root.SchoolData={users,store,validate,canCreate,get actor(){return actor;},get user(){return session?.user||null;},initialize,
  async askTasks(question){
   if(!actor)throw new Error('Vui lòng đăng nhập và tải dữ liệu trước khi hỏi.');
   const version=generation,token=await access();
   const response=await network(URL+'/functions/v1/task-chat',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({question})});
   const value=await response.json().catch(()=>({}));
   if(version!==generation)throw new Error('Phiên đăng nhập đã thay đổi.');
   if(!response.ok){if(response.status===401){clear();notify('signed-out');}throw Object.assign(new Error(value.error||'Trợ lý tạm thời chưa phản hồi.'),{status:response.status});}
   if(typeof value.answer!=='string'||!Array.isArray(value.sources))throw new Error('Câu trả lời chưa hợp lệ. Vui lòng thử lại.');
   return value;
  },
  async signIn(email,password){clear();notify('signed-out');const version=generation;const value=await auth('token?grant_type=password',{email,password});if(version!==generation)throw new Error('Phiên đăng nhập đã thay đổi.');persist(value);notify('signed-in');},
  async signUp(email,password){const value=await auth('signup?redirect_to='+encodeURIComponent(location.origin+location.pathname),{email,password});if(value.access_token)throw new Error('Đăng ký chưa được chấp nhận: cần quản trị viên kiểm tra Confirm Email đang bật.');return value;},
  async sendLoginLink(email){await auth('otp?redirect_to='+encodeURIComponent(location.origin+location.pathname),{email,create_user:false});},
  async signOut(){const token=session?.access_token;clear();notify('signed-out');if(token){const response=await network(URL+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token}});if(!response.ok&&response.status!==401)throw new Error('Đã xóa phiên trên máy này; chưa xác nhận thu hồi phiên máy chủ.');}},
  onAuthChange:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}
 };
 root.addEventListener('storage',event=>{if(event.key===SESSION_KEY){clear(false);try{session=JSON.parse(event.newValue||'null');}catch{}notify('storage');}});
 // Refresh on return to the tab and periodically while open; never load task data here.
 async function maintainSession(){if(session)try{await access();}catch{}}
 if(root.setInterval)root.setInterval(maintainSession,30000);
 root.addEventListener('focus',maintainSession);
})(globalThis);
