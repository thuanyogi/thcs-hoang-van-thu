begin;
create table public.telegram_task_notifications (
 task_id uuid primary key references public.tasks(id) on delete cascade,
 status text not null default 'pending' check (status in ('pending','sending','sent','failed','unknown')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.telegram_task_notifications enable row level security;
revoke all on public.telegram_task_notifications from public,anon,authenticated;
grant select,insert,update,delete on public.telegram_task_notifications to service_role;
create function private.enqueue_telegram_task() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.telegram_task_notifications(task_id) values(new.id);
 return new;
end;
$$;
revoke all on function private.enqueue_telegram_task() from public,anon,authenticated;
create trigger enqueue_telegram_task after insert on public.tasks
for each row execute function private.enqueue_telegram_task();
create function public.claim_telegram_task(p_task_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.telegram_task_notifications set status='sending',updated_at=clock_timestamp()
 where task_id=p_task_id and status='pending';
 return found;
end;
$$;
revoke all on function public.claim_telegram_task(uuid) from public,anon,authenticated;
grant execute on function public.claim_telegram_task(uuid) to service_role;
commit;
