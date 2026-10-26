begin;
-- This migration targets a new project; abort instead of overwriting existing objects.
create schema private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.departments (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (btrim(name) <> '')
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 display_name text not null check (btrim(display_name) <> ''),
 role text not null check (role in ('bgh','department_head','teacher')),
 department_id uuid references public.departments(id) on delete restrict,
 check (role = 'bgh' or department_id is not null)
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(),
 title text not null check (btrim(title) <> ''),
 description text not null default '',
 scope text not null check (scope in ('school','department')),
 department_id uuid not null references public.departments(id) on delete restrict,
 assigner_id uuid not null references public.profiles(id) on delete restrict,
 assignee_id uuid not null references public.profiles(id) on delete restrict,
 status text not null default 'todo' check (status in ('todo','in_progress','pending_review','completed')),
 due_at timestamptz not null,
 requires_approval boolean not null default false,
 requires_evidence boolean not null default false,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 check ((status='completed') = (completed_at is not null))
);
create table public.task_submissions (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references public.tasks(id) on delete restrict,
 author_id uuid not null references public.profiles(id) on delete restrict,
 body text not null check (btrim(body) <> ''),
 submitted_at timestamptz not null default now(),
 review_status text not null check (review_status in ('pending','approved','returned','not_required')),
 reviewer_id uuid references public.profiles(id) on delete restrict,
 reviewed_at timestamptz,
 check ((review_status in ('approved','returned') and reviewer_id is not null and reviewed_at is not null)
 or (review_status in ('pending','not_required') and reviewer_id is null and reviewed_at is null))
);
create table public.task_events (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references public.tasks(id) on delete restrict,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 event_type text not null check (event_type in ('created','started','submitted','approved','returned','due_changed','completed')),
 reason text,
 old_due_at timestamptz,
 new_due_at timestamptz,
 created_at timestamptz not null default now(),
 check (event_type not in ('returned','due_changed') or (reason is not null and btrim(reason) <> ''))
);
create table public.evidence_files (
 id uuid primary key default gen_random_uuid(),
 submission_id uuid not null references public.task_submissions(id) on delete restrict,
 storage_path text not null unique check (btrim(storage_path) <> ''),
 original_name text not null check (btrim(original_name) <> ''),
 mime_type text not null,
 size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
 created_at timestamptz not null default now()
);
create index profiles_department_idx on public.profiles(department_id);
create index tasks_assignee_status_due_idx on public.tasks(assignee_id,status,due_at);
create index tasks_department_status_due_idx on public.tasks(department_id,status,due_at);
create index tasks_assigner_idx on public.tasks(assigner_id);
create index tasks_created_idx on public.tasks(created_at);
create index submissions_task_time_idx on public.task_submissions(task_id,submitted_at);
create index submissions_author_idx on public.task_submissions(author_id);
create index submissions_reviewer_idx on public.task_submissions(reviewer_id);
create unique index submissions_one_pending_idx on public.task_submissions(task_id) where review_status='pending';
create index events_task_time_idx on public.task_events(task_id,created_at);
create index events_actor_idx on public.task_events(actor_id);
create index evidence_submission_idx on public.evidence_files(submission_id);

-- Lookup only the caller's persisted profile; no user-controlled claims or caller-supplied ID.
create function private.current_role() returns text
language sql stable security definer set search_path = ''
as $$ select p.role from public.profiles p where p.id = (select auth.uid()) and (select auth.uid()) is not null $$;
create function private.current_department() returns uuid
language sql stable security definer set search_path = ''
as $$ select p.department_id from public.profiles p where p.id = (select auth.uid()) and (select auth.uid()) is not null $$;
revoke all on function private.current_role(), private.current_department() from public, anon;
grant execute on function private.current_role(), private.current_department() to authenticated;

create function private.reject_event_changes() returns trigger
language plpgsql security invoker set search_path = ''
as $$ begin raise exception 'Task history is append-only' using errcode='42501'; end $$;
revoke all on function private.reject_event_changes() from public, anon, authenticated;
create trigger task_events_append_only before update or delete on public.task_events
for each row execute function private.reject_event_changes();

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_submissions enable row level security;
alter table public.task_events enable row level security;
alter table public.evidence_files enable row level security;
revoke all on public.departments,public.profiles,public.tasks,public.task_submissions,public.task_events,public.evidence_files from public,anon,authenticated,service_role;
grant select on public.departments,public.profiles,public.tasks,public.task_submissions,public.task_events,public.evidence_files to authenticated;
grant select,insert,update on public.departments,public.profiles,public.tasks,public.task_submissions,public.task_events,public.evidence_files to service_role;

create policy departments_read on public.departments for select to authenticated
using ((select private.current_role())='bgh' or id=(select private.current_department()));
create policy profiles_read on public.profiles for select to authenticated
using (id=(select auth.uid()) or (select private.current_role())='bgh' or
((select private.current_role())='department_head' and department_id=(select private.current_department())));
create policy tasks_read on public.tasks for select to authenticated
using ((select private.current_role())='bgh'
or ((select private.current_role())='department_head' and department_id=(select private.current_department()))
or ((select private.current_role())='teacher' and assignee_id=(select auth.uid())));
create policy submissions_read on public.task_submissions for select to authenticated
using (exists (select 1 from public.tasks t where t.id=task_id));
create policy events_read on public.task_events for select to authenticated
using (exists (select 1 from public.tasks t where t.id=task_id));
create policy evidence_read on public.evidence_files for select to authenticated
using (exists (select 1 from public.task_submissions s where s.id=submission_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('task-evidence','task-evidence',false,26214400,array[
'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
'application/pdf','image/jpeg','image/png']);
create policy task_evidence_read on storage.objects for select to authenticated
using (bucket_id='task-evidence' and exists
(select 1 from public.evidence_files f where f.storage_path=storage.objects.name));
commit;
