import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
import { UUID, MAX_FILE_BYTES, validateAction, validateFile, matchesFileContent } from './workflow-validation.js';
import { validateTask } from './validation.js';
import { attachTaskHistory } from './task-history.js';
const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const storage = createClient(url,admin,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from('task-evidence');
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const json = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
class ApiError extends Error {
 constructor(public status:number,message:string,public errors?:Record<string,string>) { super(message); }
}
async function rest(path:string,token:string,key=anon) {
 const response = await fetch(url+'/rest/v1/'+path,{headers:{apikey:key,Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
 if (!response.ok) throw new ApiError(response.status===401?401:503,'Không thể đọc dữ liệu. Vui lòng thử lại.');
 return response.json();
}
async function rows(path:string,token:string) {
 const result:any[] = [];
 for (let offset=0;;offset+=1000) {
  const batch = await rest(path+'&limit=1000&offset='+offset,token);
  result.push(...batch);
  if (batch.length<1000) return result;
 }
}
async function command(token:string,body:any,commit:boolean) {
 const response = await fetch(url+'/rest/v1/rpc/school_task_command',{
  method:'POST',headers:{apikey:anon,Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({p_request_id:body.requestId,p_action:body.action || 'create',p_task_id:body.taskId || null,p_input:body.input || {},p_commit:commit}),
  signal:AbortSignal.timeout(30000)
 });
 const data = await response.json();
 if (!response.ok) {
  const status = data.code==='42501'?403:data.code==='P0002'?404:data.code==='23505'||data.code==='40001'||data.code==='PT409'?409:data.code==='22023'?422:503;
  const messages:Record<number,string> = {403:'Bạn không có quyền thực hiện thao tác này.',404:'Không tìm thấy công việc hoặc báo cáo.',409:'Trạng thái hoặc mã yêu cầu đã thay đổi. Hãy tải lại công việc.',422:'Thông tin chưa hợp lệ. Kiểm tra báo cáo, minh chứng và lý do trả lại.',503:'Luồng xử lý chưa sẵn sàng. Cần kiểm tra bản triển khai và migration đã duyệt.'};
  throw new ApiError(status,messages[status]);
 }
 return data;
}
async function verifyUpload(file:any) {
 const response = await fetch(url+'/storage/v1/object/authenticated/task-evidence/'+file.storage_path.split('/').map(encodeURIComponent).join('/'),{
  headers:{apikey:admin,Authorization:'Bearer '+admin},signal:AbortSignal.timeout(30000)
 });
 if (!response.ok || !response.body) throw new ApiError(422,'Tệp chưa tải lên hoàn tất. Hãy tải lại tệp rồi gửi báo cáo.');
 const reader = response.body.getReader(),bytes=new Uint8Array(file.size_bytes);
 let size=0;
 try {
  while (true) {
   const {value,done}=await reader.read();
   if (done) break;
   size+=value.byteLength;
   if (size>MAX_FILE_BYTES || size>file.size_bytes) throw new ApiError(422,'Kích thước tệp thật không khớp hoặc vượt 25 MB.');
   bytes.set(value,size-value.byteLength);
  }
 } finally { await reader.cancel().catch(()=>{}); }
 if (size!==file.size_bytes) throw new ApiError(422,'Kích thước tệp thật không khớp thông tin tải lên.');
 if (!matchesFileContent(bytes,file.original_name)) throw new ApiError(422,'Nội dung tệp không đúng định dạng đã khai báo. Hãy chọn lại tệp minh chứng.');
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 const sha256=Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
 const attested=await fetch(url+'/rest/v1/rpc/school_task_verify_upload',{
  method:'POST',headers:{apikey:admin,Authorization:'Bearer '+admin,'Content-Type':'application/json'},
  body:JSON.stringify({p_upload_id:file.id,p_sha256:sha256,p_size_bytes:size}),signal:AbortSignal.timeout(15000)
 });
 if (!attested.ok) throw new ApiError(409,'Minh chứng đã thay đổi hoặc đã được sử dụng. Hãy tải lại công việc.');
}
async function detail(id:string,token:string) {
 const tasks=await rest('tasks?select=*&id=eq.'+id,token);
 if (!tasks.length) throw new ApiError(404,'Không tìm thấy công việc.');
 const [submissions,events,files]=await Promise.all([
  rows('task_submissions?select=*&task_id=eq.'+id+'&order=submitted_at.asc,id.asc',token),
  rows('task_events?select=*&task_id=eq.'+id+'&order=created_at.asc,id.asc',token),
  rows('evidence_files?select=*,task_submissions!inner(task_id)&task_submissions.task_id=eq.'+id+'&order=created_at.asc,id.asc',token)
 ]);
 return {task:attachTaskHistory(tasks,submissions,events)[0],submissions,events,files:files.map(({task_submissions,...file}:any)=>file)};
}
Deno.serve(async req => {
 if (req.method==='OPTIONS') return new Response('ok',{headers:cors});
 if (!['GET','POST'].includes(req.method)) return json({error:'Phương thức không được hỗ trợ.'},405);
 const authorization=req.headers.get('authorization') || '';
 if (!authorization.startsWith('Bearer ')) return json({error:'Vui lòng đăng nhập.'},401);
 const token=authorization.slice(7);
 try {
  const authResult=await fetch(url+'/auth/v1/user',{headers:{apikey:anon,Authorization:authorization},signal:AbortSignal.timeout(15000)});
  if (!authResult.ok) throw new ApiError(401,'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  const user=await authResult.json();
  if (!user.email_confirmed_at) throw new ApiError(403,'Vui lòng xác nhận email trước khi truy cập hệ thống.');
  const actor=(await rest('profiles?select=*&id=eq.'+user.id,token))[0];
  if (!actor || !['bgh','department_head','teacher'].includes(actor.role)) throw new ApiError(403,'Tài khoản chưa được nhà trường cấp quyền.');
  if (req.method==='GET') {
   const id=new URL(req.url).searchParams.get('id');
   if (id && !UUID.test(id)) throw new ApiError(400,'Mã công việc không hợp lệ.');
   if (id) return json(await detail(id,token));
   const [tasks,people,departments,submissions,events]=await Promise.all([
    rows('tasks?select=*&order=created_at.desc,id.asc',token),
    rows('profiles?select=*&order=id.asc',token),rows('departments?select=*&order=id.asc',token),
    rows('task_submissions?select=task_id,submitted_at,review_status&order=submitted_at.desc,id.desc',token),
    rows('task_events?select=task_id,event_type,reason,created_at&event_type=eq.returned&order=created_at.desc,id.desc',token)
   ]);
   // A name lookup reveals only names referenced by tasks already authorized through RLS.
   const ids=[...new Set(tasks.flatMap(t=>[t.assigner_id,t.assignee_id]))];let names:any[]=[];
   for (let i=0;i<ids.length;i+=100) names.push(...await rest('profiles?select=id,display_name&id=in.('+ids.slice(i,i+100).join(',')+')',admin,admin));
   return json({actor,users:people,departments,tasks:attachTaskHistory(tasks,submissions,events),names});
  }
  if (Number(req.headers.get('content-length') || 0)>65536) throw new ApiError(413,'Nội dung yêu cầu quá lớn.');
  const reader=req.body?.getReader(),chunks:Uint8Array[]=[];let total=0;
  if (reader) try {
   while (true) {
    const {value,done}=await reader.read();if (done) break;
    total+=value.byteLength;
    if (total>65536) throw new ApiError(413,'Nội dung yêu cầu quá lớn.');
    chunks.push(value);
   }
  } finally { await reader.cancel().catch(()=>{}); }
  const bytes=new Uint8Array(total);let position=0;
  for (const chunk of chunks) {bytes.set(chunk,position);position+=chunk.byteLength;}
  const raw=new TextDecoder().decode(bytes);
  let body:any;try {body=JSON.parse(raw);} catch {throw new ApiError(400,'Dữ liệu yêu cầu không hợp lệ.');}
  if (!body || typeof body!=='object' || Array.isArray(body) || !UUID.test(body.requestId || '')) throw new ApiError(400,'Mã yêu cầu không hợp lệ.');
  const action=body.action || 'create';
  if (!['create','start','submit','review','prepare-upload','signed-download'].includes(action)) throw new ApiError(400,'Hành động không được hỗ trợ.');
  if (action==='signed-download') {
   if (!UUID.test(body.fileId || '')) throw new ApiError(400,'Mã minh chứng không hợp lệ.');
   const files=await rest('evidence_files?select=storage_path,original_name&id=eq.'+body.fileId,token);
   if (!files.length) throw new ApiError(404,'Không tìm thấy minh chứng.');
   // Sign using the caller's JWT so Storage RLS performs a second permission check.
   const privateStorage=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}}).storage.from('task-evidence');
   const {data,error}=await privateStorage.createSignedUrl(files[0].storage_path,60,{download:files[0].original_name});
   if (error) throw new ApiError(503,'Không thể tạo liên kết tải tệp. Vui lòng thử lại.');
   return json({signedUrl:data.signedUrl,expiresIn:60});
  }
  if (action!=='create' && !UUID.test(body.taskId || '')) throw new ApiError(400,'Mã công việc không hợp lệ.');
  if (action==='prepare-upload') {
   const error=validateFile(body.input);
   if (error) throw new ApiError(422,error,{evidence:error});
  }
  if (action==='create') {
   const recipientId=typeof body.input?.assigneeId==='string' && UUID.test(body.input.assigneeId) ? body.input.assigneeId : null;
   const recipient=recipientId ? (await rest('profiles?select=*&id=eq.'+recipientId,token))[0] : null;
   const errors=validateTask(actor,recipient,body.input);
   if (Object.keys(errors).length) throw new ApiError(errors.permission?403:422,'Vui lòng kiểm tra thông tin công việc.',errors);
  }
  const check=await command(token,body,false);
  if (!check.result) {
   let errors:Record<string,string>={};
   if (action==='create') errors=validateTask(actor,check.recipient,body.input);
   else if (action!=='prepare-upload') errors=validateAction(actor,check.task,action,body.input);
   if (Object.keys(errors).length) throw new ApiError(errors.permission?403:errors.conflict?409:422,'Vui lòng kiểm tra thông tin.',errors);
   if (action==='submit') for (const file of check.uploads) await verifyUpload(file);
  }
  const result=check.result || await command(token,body,true);
  if (action==='prepare-upload') {
   const {data,error}=await storage.createSignedUploadUrl(result.storagePath,{upsert:false});
   if (error) throw new ApiError(503,'Chưa tạo được liên kết tải lên. Hãy thử lại với cùng mã yêu cầu.');
   return json({...result,token:data.token,signedUrl:data.signedUrl,expiresIn:7200});
  }
  if (action==='create') {
   // The command has committed. Notification failures must never undo or mask the saved task.
   let notification:any={status:'unknown'};
   try {
    const response=await fetch(url+'/functions/v1/telegram-notify',{
     method:'POST',headers:{apikey:anon,Authorization:authorization,'Content-Type':'application/json'},
     body:JSON.stringify({taskId:result.task.id}),signal:AbortSignal.timeout(15000)
    });
    const value=await response.json();
    if(response.ok && ['sent','failed','unknown','not_queued'].includes(value.status)) notification={status:value.status};
   } catch { /* Keep the committed result even when notification delivery is uncertain. */ }
   return json({...result,notification});
  }
  return json(result);
 } catch (error) {
  if (error instanceof ApiError) return json({error:error.message,...(error.errors?{errors:error.errors}:{})},error.status);
  console.error('school-tasks request failed',error instanceof Error?error.name:'UnknownError');
  return json({error:'Chưa hoàn tất yêu cầu. Hãy thử lại với cùng mã yêu cầu để tránh ghi trùng.'},503);
 }
});
