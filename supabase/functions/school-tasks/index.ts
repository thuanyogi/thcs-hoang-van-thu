import postgres from 'npm:postgres@3.4.3';
import { validateTask, sameRequest } from './validation.js';
const url=Deno.env.get('SUPABASE_URL')!;
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const admin=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const sql=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,max:1,idle_timeout:20,connect_timeout:10});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function rest(path:string,token:string,key=anon) {
 const response=await fetch(url+'/rest/v1/'+path,{headers:{apikey:key,Authorization:'Bearer '+token}});
 if(!response.ok) throw new Error('read_failure');
 return response.json();
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
 if(!['GET','POST'].includes(req.method)) return json({error:'Phương thức không được hỗ trợ.'},405);
 const auth=req.headers.get('authorization')||'';
 if(!auth.startsWith('Bearer ')) return json({error:'Vui lòng đăng nhập.'},401);
 const token=auth.slice(7);
 try {
  const authResult=await fetch(url+'/auth/v1/user',{headers:{apikey:anon,Authorization:auth}});
  if(!authResult.ok) return json({error:'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'},401);
  const user=await authResult.json();
  const profiles=await rest('profiles?select=*&id=eq.'+user.id,token);
  const actor=profiles[0];
  if(!actor) return json({error:'Tài khoản chưa được nhà trường cấp quyền.'},403);
  const route=new URL(req.url);
  if(req.method==='GET') {
   const id=route.searchParams.get('id');
   if(id && !uuid.test(id)) return json({error:'Mã công việc không hợp lệ.'},400);
   let tasks:any[]=[];
   for(let offset=0;;offset+=1000) {
    const batch=await rest('tasks?select=*&order=created_at.desc,id.asc&limit=1000&offset='+offset+(id?'&id=eq.'+id:''),token);
    tasks.push(...batch);
    if(batch.length<1000) break;
   }
   if(id) return tasks[0]?json({task:tasks[0]}):json({error:'Không tìm thấy công việc.'},404);
   const [people,departments]=await Promise.all([rest('profiles?select=*',token),rest('departments?select=*',token)]);
   // Return only display names for people referenced by already-authorized tasks.
   const ids=[...new Set(tasks.flatMap(t=>[t.assigner_id,t.assignee_id]))];
   let names:any[]=[];
   if(ids.length) {
    for(let i=0;i<ids.length;i+=100) names.push(...await rest('profiles?select=id,display_name&id=in.('+ids.slice(i,i+100).join(',')+')',admin,admin));
   }
   return json({actor,users:people,departments,tasks,names});
  }
  if(Number(req.headers.get('content-length')||0)>32768) return json({error:'Nội dung yêu cầu quá lớn.'},413);
  const raw=await req.text();
  if(raw.length>32768) return json({error:'Nội dung yêu cầu quá lớn.'},413);
  let body; try{body=JSON.parse(raw);}catch{return json({error:'Dữ liệu yêu cầu không hợp lệ.'},400);}
  const {requestId,input}=body||{};
  if(typeof requestId!=='string'||!uuid.test(requestId)) return json({error:'Mã yêu cầu không hợp lệ.'},400);
  const recipientId=typeof input?.assigneeId==='string'&&uuid.test(input.assigneeId)?input.assigneeId:null;
  const result=await sql.begin(async tx=>{
   await tx`select pg_advisory_xact_lock(hashtextextended(${requestId},0))`;
   const actors=await tx`select * from public.profiles where id=${user.id} for share`;
   const recipients=recipientId?await tx`select * from public.profiles where id=${recipientId} for share`:[];
   const errors=validateTask(actors[0],recipients[0],input);
   if(Object.keys(errors).length) return {errors};
   const recipient=recipients[0];
   const existing=await tx`select * from public.tasks where id=${requestId}`;
   if(existing.length) return sameRequest(existing[0],user.id,input,recipient.department_id)?{task:existing[0]}:{conflict:true};
   const inserted=await tx`insert into public.tasks
    (id,title,description,scope,department_id,assigner_id,assignee_id,due_at,requires_approval,requires_evidence)
    values (${requestId},${input.title.trim()},${input.description.trim()},${input.scope},${recipient.department_id},${user.id},${recipientId},${input.dueDate+'T23:59:59+07:00'},${input.requiresApproval},${input.requiresEvidence}) returning *`;
   await tx`insert into public.task_events(task_id,actor_id,event_type) values (${requestId},${user.id},'created')`;
   return {task:inserted[0]};
  });
  if(result.errors) return json({error:'Vui lòng kiểm tra thông tin công việc.',errors:result.errors},result.errors.permission?403:422);
  if(result.conflict) return json({error:'Mã yêu cầu đã dùng cho nội dung khác. Hãy mở lại form.'},409);
  return json(result);
 }catch(error) {
  console.error('school-tasks request failed',error instanceof Error?error.name:'UnknownError');
  return json({error:'Chưa hoàn tất yêu cầu. Bạn hãy thử lại; giữ nguyên form để tránh tạo trùng.'},503);
 }
});
