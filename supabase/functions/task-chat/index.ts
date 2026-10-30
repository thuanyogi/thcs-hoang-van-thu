import { prepareContext, safeTasks } from './task-context.js';
import { answerTasks, ChatError } from './gemini-client.js';
const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const allowed=new Set(['https://thcs-hoang-van-thu.vercel.app','http://localhost:3000','http://127.0.0.1:3000']);
const usage=new Map<string,{since:number,count:number,busy:boolean}>();
Deno.serve(async req=>{
 const origin=req.headers.get('origin');
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(origin&&allowed.has(origin)?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!allowed.has(origin)) return json({error:'Nguồn truy cập không được phép.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return json({error:'Phương thức không được hỗ trợ.'},405);
 const authorization=req.headers.get('authorization')||'';
 if(!authorization.startsWith('Bearer '))return json({error:'Vui lòng đăng nhập.'},401);
 const userHeaders={apikey:anon,Authorization:authorization};
 let reservation:{since:number,count:number,busy:boolean}|undefined;
 async function read(path:string) {
  const response=await fetch(url+'/rest/v1/'+path,{headers:userHeaders,signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new ChatError(response.status===401?401:503,'Không đọc được dữ liệu công việc. Vui lòng tải lại hoặc đăng nhập lại.');
  return response.json();
 }
 try {
  const auth=await fetch(url+'/auth/v1/user',{headers:userHeaders,signal:AbortSignal.timeout(10000)});
  if(!auth.ok) return json({error:'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'},401);
  const user=await auth.json();
  if(!user.email_confirmed_at) return json({error:'Vui lòng xác nhận email.'},403);
  const actor=(await read('profiles?select=id,role&id=eq.'+encodeURIComponent(user.id)))[0];
  if(!actor||!['bgh','department_head','teacher'].includes(actor.role))return json({error:'Tài khoản chưa được nhà trường cấp quyền.'},403);
  const reader=req.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
  if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192)throw new ChatError(413,'Câu hỏi quá dài.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let input:any;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ChatError(400,'Câu hỏi không hợp lệ.');}
  if(typeof input?.question!=='string'||!input.question.trim()||input.question.length>1000||Object.keys(input).some(k=>k!=='question'))throw new ChatError(422,'Nhập câu hỏi từ 1 đến 1.000 ký tự.');
  const now=Date.now();for(const [id,v] of usage)if(now-v.since>=60000&&!v.busy)usage.delete(id);
  const existing=usage.get(user.id);
  if(existing&&(existing.busy||existing.count>=6))return json({error:'Bạn đang gửi quá nhanh. Vui lòng chờ một phút.'},429);
  reservation=existing;
  if(!reservation){reservation={since:now,count:0,busy:false};usage.set(user.id,reservation);}
  reservation.count++;reservation.busy=true;
  // Read only with the caller JWT. No admin/service credential is used anywhere in this function.
  const rows:any[]=[];let partial=false;
  for(let page=0;page<3;page++){
   const batch=await read('tasks?select=id,title,status,due_at,assignee_id&order=created_at.desc,id.asc&limit=400&offset='+(page*400));
   rows.push(...batch);if(batch.length<400)break;if(page===2)partial=true;
  }
  const context=prepareContext(rows,input.question.trim(),user.id,now);
  if(!rows.length)return json({answer:'Bạn chưa có công việc nào trong phạm vi được xem.',sources:[],summary:context.summary,partial,scopeNote:context.scopeNote});
  const ids=context.selected.map((t:any)=>t.id);
  const details=ids.length?await read('tasks?select=id,title,description,status,due_at&id=in.('+ids.join(',')+')'):[];
  const tasks=safeTasks(details);
  const result=await answerTasks({key:Deno.env.get('GEMINI_API_KEY'),model:Deno.env.get('GEMINI_MODEL')||'gemini-2.5-flash',question:input.question.trim(),tasks,summary:context.summary,partial,scopeNote:context.scopeNote,now:new Date(now).toISOString()});
  return json({...result,summary:context.summary,partial,contextLimited:context.contextLimited,scopeNote:context.scopeNote});
 }catch(error){if(error instanceof ChatError)return json({error:error.message},error.status);return json({error:'Trợ lý tạm thời chưa phản hồi. Vui lòng thử lại sau.'},503);}
 finally{if(reservation)reservation.busy=false;}
});
