-- DRAFT: thcs-hoang-van-thu / iqchlkfmgxeafgsbconv. DO NOT APPLY without exact preview approval.
-- Normal commands derive identity from auth.uid(); callers cannot supply an actor or role.
-- Only Storage byte verification attestation is reserved to the trusted Edge Function.
begin;
create table private.school_task_requests (
 request_id uuid primary key,
 actor_id uuid not null references public.profiles(id),
 action text not null,
 task_id uuid,
 input jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
create table private.school_task_uploads (
 id uuid primary key,
 task_id uuid not null references public.tasks(id),
 actor_id uuid not null references public.profiles(id),
 storage_path text not null unique,
 original_name text not null,
 mime_type text not null,
 size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now() + interval '24 hours'),
 submission_id uuid references public.task_submissions(id),
 verified_at timestamptz,
 verified_sha256 text check (verified_sha256 is null or verified_sha256 ~ '^[0-9a-f]{64}$')
);
create index school_task_uploads_task_actor_idx on private.school_task_uploads(task_id,actor_id);
revoke all on private.school_task_requests,private.school_task_uploads from public,anon,authenticated,service_role;
alter table private.school_task_requests enable row level security;
alter table private.school_task_uploads enable row level security;

create function private.school_task_can_read(a public.profiles,t public.tasks) returns boolean
language sql immutable security invoker set search_path=''
as $$ select coalesce(a.role='bgh' or (a.role='department_head' and a.department_id=t.department_id)
 or (a.role='teacher' and t.assignee_id=a.id),false) $$;
create function private.school_task_valid_date(value text) returns boolean
language plpgsql immutable security invoker set search_path=''
as $$ begin
 if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
 return to_char(value::date,'YYYY-MM-DD')=value;
 exception when others then return false;
end $$;
create function private.school_task_valid_file(name text,mime text,size bigint) returns boolean
language sql immutable security invoker set search_path=''
as $$ select coalesce(length(btrim(name)) between 1 and 255 and name !~ '[[:cntrl:]/\\]'
 and size between 1 and 26214400 and mime=case lower(substring(name from '\.([^.]+)$'))
 when 'doc' then 'application/msword' when 'xls' then 'application/vnd.ms-excel' when 'ppt' then 'application/vnd.ms-powerpoint'
 when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
 when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
 when 'pdf' then 'application/pdf' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png' end,false) $$;
revoke all on function private.school_task_can_read(public.profiles,public.tasks),private.school_task_valid_date(text),private.school_task_valid_file(text,text,bigint) from public,anon,authenticated,service_role;

create function public.school_task_command(p_request_id uuid,p_action text,p_task_id uuid,p_input jsonb,p_commit boolean default true)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 a public.profiles; recipient public.profiles; t public.tasks; s public.task_submissions;
 previous private.school_task_requests; upload private.school_task_uploads;
 uploads jsonb := '[]'::jsonb; evidence jsonb; result jsonb;
 now_at timestamptz := clock_timestamp(); new_due timestamptz; reason text;
 v_submission_id uuid; v_storage_path text; extension text; seen_paths text[] := '{}';
begin
 if p_request_id is null or auth.uid() is null or p_action is null or p_action not in ('create','start','submit','review','prepare-upload')
 or p_input is null or jsonb_typeof(p_input)<>'object' or p_commit is null then
  raise exception 'invalid command' using errcode='22023';
 end if;
 -- Serialize retries across every action before checking or writing its result.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into a from public.profiles where id=auth.uid() for share;
 if not found or a.role not in ('bgh','department_head','teacher') then raise exception 'actor not provisioned' using errcode='42501'; end if;
 select * into previous from private.school_task_requests where request_id=p_request_id;
 if found then
  if previous.actor_id<>a.id or previous.action<>p_action or previous.task_id is distinct from p_task_id or previous.input<>p_input then
   raise exception 'request already used' using errcode='23505';
  end if;
  select * into t from public.tasks where id=coalesce(p_task_id,(previous.result->'task'->>'id')::uuid);
  if not found or not private.school_task_can_read(a,t) then raise exception 'task not accessible' using errcode='42501'; end if;
  -- An unconsumed reservation may be re-signed, but never after its lifetime or status ends.
  if p_action='prepare-upload' and (t.assignee_id<>a.id or t.status not in ('todo','in_progress')
   or not exists(select 1 from private.school_task_uploads u where u.id=p_request_id and u.expires_at>now_at and u.submission_id is null)) then
   raise exception 'upload reservation expired or consumed' using errcode='40001';
  end if;
  if not p_commit then return jsonb_build_object('result',previous.result); end if;
  return previous.result;
 end if;
 if p_action='create' then
  if a.role not in ('bgh','department_head') then raise exception 'create denied' using errcode='42501'; end if;
  if p_task_id is not null or jsonb_typeof(p_input->'title') is distinct from 'string'
   or length(btrim(p_input->>'title')) not between 1 and 500
   or jsonb_typeof(p_input->'description') is distinct from 'string' or length(btrim(p_input->>'description')) not between 1 and 20000
   or jsonb_typeof(p_input->'requiresApproval') is distinct from 'boolean' or jsonb_typeof(p_input->'requiresEvidence') is distinct from 'boolean'
   or not private.school_task_valid_date(p_input->>'dueDate') then raise exception 'invalid task' using errcode='22023'; end if;
  select * into recipient from public.profiles where id=(p_input->>'assigneeId')::uuid for share;
  if not found or recipient.role<>'teacher' or p_input->>'scope' is distinct from (case a.role when 'bgh' then 'school' else 'department' end)
   or (a.role='department_head' and recipient.department_id is distinct from a.department_id) then raise exception 'invalid assignment' using errcode='42501'; end if;
  if not p_commit then return jsonb_build_object('recipient',to_jsonb(recipient)); end if;
  new_due := ((p_input->>'dueDate')||'T23:59:59+07:00')::timestamptz;
  -- Existing create requests used request_id as task ID; preserve that contract and safe retries.
  select * into t from public.tasks where id=p_request_id for update;
  if found then
   if t.assigner_id<>a.id or t.title<>btrim(p_input->>'title') or t.description<>btrim(p_input->>'description')
    or t.assignee_id<>recipient.id or t.scope<>p_input->>'scope' or t.department_id<>recipient.department_id or t.due_at<>new_due
    or t.requires_approval<>(p_input->>'requiresApproval')::boolean or t.requires_evidence<>(p_input->>'requiresEvidence')::boolean then
    raise exception 'existing task differs' using errcode='23505';
   end if;
  else
   insert into public.tasks(id,title,description,scope,department_id,assigner_id,assignee_id,due_at,requires_approval,requires_evidence)
   values(p_request_id,btrim(p_input->>'title'),btrim(p_input->>'description'),p_input->>'scope',recipient.department_id,a.id,recipient.id,new_due,
    (p_input->>'requiresApproval')::boolean,(p_input->>'requiresEvidence')::boolean) returning * into t;
   insert into public.task_events(task_id,actor_id,event_type) values(t.id,a.id,'created');
  end if;
  result := jsonb_build_object('task',to_jsonb(t));
 else
  select * into t from public.tasks where id=p_task_id for update;
  if not found or not private.school_task_can_read(a,t) then raise exception 'task not found' using errcode='P0002'; end if;
  if p_action in ('start','submit','prepare-upload') then
   if t.assignee_id<>a.id then raise exception 'assignee required' using errcode='42501'; end if;
   if t.status not in ('todo','in_progress') or (p_action='start' and t.status<>'todo') then raise exception 'stale task state' using errcode='40001'; end if;
  end if;
  if p_action='prepare-upload' then
   if jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'type') is distinct from 'string'
    or jsonb_typeof(p_input->'size') is distinct from 'number' or (p_input->>'size') !~ '^[0-9]+$'
    or not private.school_task_valid_file(p_input->>'name',p_input->>'type',(p_input->>'size')::bigint) then raise exception 'invalid file metadata' using errcode='22023'; end if;
   if not p_commit then return jsonb_build_object('task',to_jsonb(t)); end if;
   extension := lower(substring(p_input->>'name' from '\.([^.]+)$'));
   v_storage_path := a.id::text||'/'||t.id::text||'/'||p_request_id::text||'.'||extension;
   insert into private.school_task_uploads(id,task_id,actor_id,storage_path,original_name,mime_type,size_bytes)
    values(p_request_id,t.id,a.id,v_storage_path,p_input->>'name',p_input->>'type',(p_input->>'size')::bigint);
   result := jsonb_build_object('storagePath',v_storage_path);
  elsif p_action='start' then
   if not p_commit then return jsonb_build_object('task',to_jsonb(t)); end if;
   update public.tasks set status='in_progress' where id=t.id returning * into t;
   insert into public.task_events(task_id,actor_id,event_type) values(t.id,a.id,'started');
   result := jsonb_build_object('task',to_jsonb(t));
  elsif p_action='submit' then
   if jsonb_typeof(p_input->'body') is distinct from 'string' or length(btrim(p_input->>'body')) not between 1 and 20000
    or jsonb_typeof(p_input->'evidence') is distinct from 'array' then raise exception 'invalid report' using errcode='22023'; end if;
   if t.requires_evidence and jsonb_array_length(p_input->'evidence')=0 then raise exception 'evidence required' using errcode='22023'; end if;
   -- Lock reservations in stable order. Immutable Storage objects were inspected by trusted Edge before commit.
   for evidence in select value from jsonb_array_elements(p_input->'evidence') order by value->>'storagePath' loop
    select * into upload from private.school_task_uploads u where u.storage_path=evidence->>'storagePath' for update;
    if not found or upload.task_id<>t.id or upload.actor_id<>a.id or upload.submission_id is not null or upload.expires_at<=now_at
     or upload.original_name is distinct from evidence->>'originalName' or upload.mime_type is distinct from evidence->>'mimeType'
     or jsonb_typeof(evidence->'sizeBytes') is distinct from 'number' or upload.size_bytes::text is distinct from evidence->>'sizeBytes'
     or upload.storage_path=any(seen_paths) then raise exception 'invalid evidence reservation' using errcode='22023'; end if;
    if (p_commit and upload.verified_at is null) or not exists(select 1 from storage.objects o where o.bucket_id='task-evidence' and o.name=upload.storage_path) then
     raise exception 'file not uploaded' using errcode='22023'; end if;
    seen_paths := array_append(seen_paths,upload.storage_path);
    uploads := uploads || jsonb_build_array(to_jsonb(upload));
   end loop;
   if not p_commit then return jsonb_build_object('task',to_jsonb(t),'uploads',uploads); end if;
   v_submission_id := gen_random_uuid();
   insert into public.task_submissions(id,task_id,author_id,body,submitted_at,review_status)
    values(v_submission_id,t.id,a.id,btrim(p_input->>'body'),now_at,case when t.requires_approval then 'pending' else 'not_required' end) returning * into s;
   insert into public.evidence_files(submission_id,storage_path,original_name,mime_type,size_bytes)
    select v_submission_id,u.storage_path,u.original_name,u.mime_type,u.size_bytes from private.school_task_uploads u where u.storage_path=any(seen_paths);
   update private.school_task_uploads set submission_id=s.id where private.school_task_uploads.storage_path=any(seen_paths);
   update public.tasks set status=case when requires_approval then 'pending_review' else 'completed' end,
    completed_at=case when requires_approval then null else now_at end where id=t.id returning * into t;
   insert into public.task_events(task_id,actor_id,event_type,created_at) values(t.id,a.id,'submitted',now_at);
   if not t.requires_approval then insert into public.task_events(task_id,actor_id,event_type,created_at) values(t.id,a.id,'completed',now_at); end if;
   result := jsonb_build_object('task',to_jsonb(t),'submission',to_jsonb(s));
  elsif p_action='review' then
   if not ((a.role='bgh' and t.scope='school') or (a.role='department_head' and t.scope='department' and a.department_id=t.department_id)) then
    raise exception 'review denied' using errcode='42501'; end if;
   if t.status<>'pending_review' then raise exception 'stale review' using errcode='40001'; end if;
   select * into s from public.task_submissions where id=(p_input->>'submissionId')::uuid and task_id=t.id for update;
   if not found or s.review_status<>'pending' then raise exception 'stale submission' using errcode='40001'; end if;
   if p_input->>'decision' is null or p_input->>'decision' not in ('approve','return') then raise exception 'invalid decision' using errcode='22023'; end if;
   if p_input->>'decision'='return' then
    reason := btrim(p_input->>'reason');
    if jsonb_typeof(p_input->'reason') is distinct from 'string' or length(reason) not between 1 and 20000 then raise exception 'return reason required' using errcode='22023'; end if;
   end if;
   new_due := t.due_at;
   if coalesce(p_input->>'newDueDate','')<>'' then
    if p_input->>'decision'<>'return' or not private.school_task_valid_date(p_input->>'newDueDate') then raise exception 'invalid due date' using errcode='22023'; end if;
    new_due := ((p_input->>'newDueDate')||'T23:59:59+07:00')::timestamptz;
   end if;
   if not p_commit then return jsonb_build_object('task',to_jsonb(t)); end if;
   update public.task_submissions set review_status=case when p_input->>'decision'='approve' then 'approved' else 'returned' end,
    reviewer_id=a.id,reviewed_at=now_at where id=s.id returning * into s;
   insert into public.task_events(task_id,actor_id,event_type,reason,created_at)
    values(t.id,a.id,case when p_input->>'decision'='approve' then 'approved' else 'returned' end,reason,now_at);
   if new_due<>t.due_at then
    insert into public.task_events(task_id,actor_id,event_type,reason,old_due_at,new_due_at,created_at) values(t.id,a.id,'due_changed',reason,t.due_at,new_due,now_at);
   end if;
   update public.tasks set status=case when p_input->>'decision'='approve' then 'completed' else 'in_progress' end,
    completed_at=case when p_input->>'decision'='approve' then now_at else null end,due_at=new_due where id=t.id returning * into t;
   if p_input->>'decision'='approve' then insert into public.task_events(task_id,actor_id,event_type,created_at) values(t.id,a.id,'completed',now_at); end if;
   result := jsonb_build_object('task',to_jsonb(t),'submission',to_jsonb(s));
  end if;
 end if;
 insert into private.school_task_requests(request_id,actor_id,action,task_id,input,result)
 values(p_request_id,a.id,p_action,p_task_id,p_input,result);
 return result;
exception when invalid_text_representation or numeric_value_out_of_range then
 raise exception 'invalid input type' using errcode='22023';
end $$;
revoke all on function public.school_task_command(uuid,text,uuid,jsonb,boolean) from public,anon,service_role;
grant execute on function public.school_task_command(uuid,text,uuid,jsonb,boolean) to authenticated;
comment on function public.school_task_command(uuid,text,uuid,jsonb,boolean) is
'Constrained authenticated command. Identity from auth.uid(), persisted profile and task locks. Submit requires trusted server attestation of immutable Storage bytes; direct table writes remain denied.';
create function public.school_task_verify_upload(p_upload_id uuid,p_sha256 text,p_size_bytes bigint) returns void
language plpgsql security definer set search_path=''
as $$
declare u private.school_task_uploads;
begin
 if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid checksum' using errcode='22023'; end if;
 select * into u from private.school_task_uploads where id=p_upload_id for update;
 if not found or u.expires_at<=clock_timestamp() or u.submission_id is not null or u.size_bytes is distinct from p_size_bytes
  or not exists(select 1 from storage.objects o where o.bucket_id='task-evidence' and o.name=u.storage_path) then
  raise exception 'invalid upload attestation' using errcode='22023';
 end if;
 update private.school_task_uploads set verified_at=clock_timestamp(),verified_sha256=p_sha256 where id=u.id;
end $$;
revoke all on function public.school_task_verify_upload(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.school_task_verify_upload(uuid,text,bigint) to service_role;
comment on function public.school_task_verify_upload(uuid,text,bigint) is
'Trusted Edge storage inspection only. Byte size and format were verified and SHA-256 computed server-side before this attestation. Does not change tasks, reports or history.';
commit;
