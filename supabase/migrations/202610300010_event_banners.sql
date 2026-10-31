-- Optional event banner image, set by the event's organiser at any stage and
-- shown to attendees (Browse events, the event's registration page) and on
-- the public page. Not part of the project brief; purely presentational, so
-- it sits outside the event's change history (PB-07 logs named fields only)
-- and outside the SPM-11 edit lock, which the edit functions enforce.
--
-- Follows the venue photo pattern (202610180003_venue_images.sql): a public
-- bucket, JPEG/PNG/WebP only, at most 5MB. A banner is promotional, so a
-- public URL is fine. Each organiser uploads only into a folder named after
-- their own user id, and set_event_banner accepts only a file from that
-- folder that actually exists, so one organiser cannot point an event at
-- another's upload.

alter table public.events add column banner_path text;

comment on column public.events.banner_path is
  'Path of the event''s banner image in the event-banners bucket; null when it has none.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-banners', 'event-banners', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "event banners are publicly readable"
on storage.objects for select
to public
using (bucket_id = 'event-banners');

create policy "organisers upload event banners to their own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'event-banners'
  and public.current_user_role() = 'event_organiser'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "organisers delete their own event banners"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'event-banners'
  and public.current_user_role() = 'event_organiser'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Sets (or, with null, removes) the event's banner. The event's own
-- organiser only, at any status.
create or replace function public.set_event_banner(p_event_id uuid, p_banner_path text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_organiser_id uuid;
  v_path text := nullif(btrim(coalesce(p_banner_path, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Only the event''s organiser can change its banner' using errcode = '42501';
  end if;

  select organiser_id into v_organiser_id from public.events where id = p_event_id for update;
  if not found or v_organiser_id is distinct from auth.uid() then
    raise exception 'Only the event''s organiser can change its banner' using errcode = '42501';
  end if;

  if v_path is not null and (
    split_part(v_path, '/', 1) <> auth.uid()::text
    or not exists (
      select 1 from storage.objects
      where bucket_id = 'event-banners' and name = v_path
    )
  ) then
    raise exception 'Upload the banner image first' using errcode = '23514';
  end if;

  update public.events set banner_path = v_path where id = p_event_id;

  return v_path;
end;
$$;

revoke all on function public.set_event_banner(uuid, text) from public, anon;
grant execute on function public.set_event_banner(uuid, text) to authenticated;
