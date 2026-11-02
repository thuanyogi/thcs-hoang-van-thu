-- Phone cameras often save HEIC/HEIF. Generic browser MIME is normalized to the
-- extension's canonical type before this check, so only the real type is stored.
create or replace function private.school_task_valid_file(name text, mime text, size bigint)
returns boolean
language sql immutable security invoker set search_path=''
as $$ select coalesce(length(btrim(name)) between 1 and 255 and name !~ '[[:cntrl:]/\\]'
 and size between 1 and 26214400 and mime=case lower(substring(name from '\.([^.]+)$'))
 when 'doc' then 'application/msword' when 'xls' then 'application/vnd.ms-excel' when 'ppt' then 'application/vnd.ms-powerpoint'
 when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
 when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
 when 'pdf' then 'application/pdf' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png'
 when 'heic' then 'image/heic' when 'heif' then 'image/heif' end,false) $$;

revoke all on function private.school_task_valid_file(text,text,bigint) from public, anon, authenticated, service_role;
