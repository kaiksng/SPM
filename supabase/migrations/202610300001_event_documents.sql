-- SPM-37: supporting documents (programmes, floor plans) attached to an event.
--
-- Kept deliberately small. The organiser uploads straight to a private
-- storage bucket from the browser (same approach as venue photos, but
-- private); add_event_document then records the file, and remove_event_document
-- records its removal. Removing deletes the stored file; the row stays, marked
-- removed with who and when.
--
-- Access is NOT can_view_event: that now admits attendees of a Confirmed
-- event and every coordinator. Documents are internal planning material, so
-- only the event's own assigned coordinator is let in (SPM-09 AC02), not
-- coordinators in general.
create or replace function public.can_access_event_documents(target_event_id uuid)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    where e.id = target_event_id
      and (
        e.organiser_id = auth.uid()
        or e.assigned_coordinator_id = auth.uid()
        or public.current_user_role() in (
          'venue_staff'::public.user_role,
          'technical_support_staff'::public.user_role,
          'event_coordinator_lead'::public.user_role
        )
        or (
          public.current_user_role() = 'safety_officer'::public.user_role
          and e.status = 'pending_safety_check'::public.event_status
        )
      )
  );
$$;

-- Documents can be added or removed until the event is finished or refused.
create or replace function public.event_documents_open(target_event_id uuid)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event_id
      and e.status not in (
        'completed'::public.event_status,
        'cancelled'::public.event_status,
        'rejected'::public.event_status
      )
  );
$$;

-- The event a storage path belongs to ("<event id>/<file>"), or null.
create or replace function public.event_id_from_document_path(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(object_name, '/', 1)::uuid
  end;
$$;

create table public.event_documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  file_name text not null check (char_length(trim(file_name)) between 1 and 255),
  storage_path text not null unique,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by uuid not null references public.profiles (id),
  -- A snapshot, so the list can show the uploader to every role that may see it.
  uploaded_by_name text not null,
  uploaded_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.profiles (id)
);

create index event_documents_event_idx on public.event_documents (event_id, uploaded_at desc);

alter table public.event_documents enable row level security;

-- Read only; every write goes through the two functions below.
create policy "event documents visible to those who may see the event's documents"
on public.event_documents for select to authenticated
using (public.can_access_event_documents(event_id));

-- Private bucket: PDF, PNG and DOCX, 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-documents', 'event-documents', false, 10485760,
  array[
    'application/pdf',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

create policy "event documents can be read by those who may see them"
on storage.objects for select to authenticated
using (
  bucket_id = 'event-documents'
  and public.can_access_event_documents(public.event_id_from_document_path(name))
);

create policy "the organiser uploads their open event's documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-documents'
  and public.event_documents_open(public.event_id_from_document_path(name))
  and exists (
    select 1 from public.events e
    where e.id = public.event_id_from_document_path(name) and e.organiser_id = auth.uid()
  )
);

create policy "the organiser deletes their event's documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'event-documents'
  and exists (
    select 1 from public.events e
    where e.id = public.event_id_from_document_path(name) and e.organiser_id = auth.uid()
  )
);

-- Records an uploaded file. Only the event's organiser, only while the event is open.
create or replace function public.add_event_document(
  p_event_id uuid,
  p_storage_path text,
  p_file_name text,
  p_content_type text,
  p_size_bytes integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  new_id uuid;
begin
  if actor_id is null then
    raise exception 'You must sign in to attach a document'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.events e where e.id = p_event_id and e.organiser_id = actor_id) then
    raise exception 'Only the event''s organiser can attach documents'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.event_documents_open(p_event_id) then
    raise exception 'Documents can no longer be changed on a completed, cancelled or rejected event'
      using errcode = 'check_violation';
  end if;

  if p_content_type not in (
    'application/pdf',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) then
    raise exception 'Only PDF, PNG or DOCX files are allowed'
      using errcode = 'check_violation';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'The file is empty'
      using errcode = 'check_violation';
  end if;

  if p_size_bytes > 10485760 then
    raise exception 'The file must be 10 MB or smaller'
      using errcode = 'check_violation';
  end if;

  if public.event_id_from_document_path(p_storage_path) is distinct from p_event_id then
    raise exception 'The file was not stored under this event'
      using errcode = 'check_violation';
  end if;

  select full_name into actor_name from public.profiles where id = actor_id;

  insert into public.event_documents (
    event_id, file_name, storage_path, content_type, size_bytes, uploaded_by, uploaded_by_name
  )
  values (
    p_event_id, trim(p_file_name), p_storage_path, p_content_type, p_size_bytes,
    actor_id, coalesce(actor_name, 'Unknown')
  )
  returning id into new_id;

  return new_id;
end;
$$;

-- Records a removal and returns the stored file's path so the caller can delete it.
-- Only the person who uploaded the document, and only while the event is open.
create or replace function public.remove_event_document(p_document_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  doc public.event_documents;
begin
  if actor_id is null then
    raise exception 'You must sign in to remove a document'
      using errcode = 'insufficient_privilege';
  end if;

  select * into doc from public.event_documents where id = p_document_id for update;

  if not found or doc.removed_at is not null or doc.uploaded_by <> actor_id then
    raise exception 'You can only remove a document you attached'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.event_documents_open(doc.event_id) then
    raise exception 'Documents can no longer be changed on a completed, cancelled or rejected event'
      using errcode = 'check_violation';
  end if;

  update public.event_documents
  set removed_at = now(), removed_by = actor_id
  where id = p_document_id;

  return doc.storage_path;
end;
$$;

revoke all on function public.add_event_document(uuid, text, text, text, integer) from public, anon;
grant execute on function public.add_event_document(uuid, text, text, text, integer) to authenticated;
revoke all on function public.remove_event_document(uuid) from public, anon;
grant execute on function public.remove_event_document(uuid) to authenticated;
